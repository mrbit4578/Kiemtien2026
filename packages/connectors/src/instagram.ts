import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider, PublishInput, PublishResult, MediaKind } from '@orh/shared'
import { validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError, detectMediaKind } from '@orh/shared'

/**
 * Instagram connector (Instagram API with Instagram Login)
 *
 * Meta đã khai tử Instagram Basic Display và Instagram Graph API dùng
 * Facebook Login. Luồng hiện tại (Instagram API with Instagram Login):
 * 1. Authorize tại www.instagram.com/oauth/authorize (KHÔNG dùng PKCE,
 *    KHÔNG qua facebook.com/dialog/oauth)
 * 2. POST api.instagram.com/oauth/access_token → short-lived token + user_id
 * 3. GET graph.instagram.com/access_token?grant_type=ig_exchange_token
 *    → long-lived token (60 ngày)
 * 4. Graph API tại graph.instagram.com (KHÔNG cần Facebook Page)
 *
 * Yêu cầu trên dashboard Meta: TẠO APP MỚI với use case
 * "Manage messaging and content on Instagram" (app cũ dùng Facebook Login
 * không thêm được use case Instagram — Meta yêu cầu tạo app mới).
 * Trong app mới: Instagram → "API setup with Instagram login", khai báo
 * redirect URI https://<api>/auth/instagram/callback, tài khoản IG phải là
 * Business/Creator, được thêm làm Instagram Tester và accept invite trong
 * app Instagram.
 *
 * Env riêng (KHÔNG dùng chung với Facebook): INSTAGRAM_APP_ID,
 * INSTAGRAM_APP_SECRET.
 *
 * Publish flow:
 * 1. POST /{ig-user-id}/media → tạo container
 * 2. POST /{ig-user-id}/media_publish → publish container
 * Container hết hạn sau 24 giờ; giới hạn 400 container/24h
 */

export const INSTAGRAM_MANIFEST: PermissionManifest = {
  provider: 'instagram',
  reviewStatus: 'pending_review',
  requiredForMvp: true,
  scopes: [
    {
      scope: 'instagram_business_basic',
      purpose: 'Đọc thông tin tài khoản Business/Creator',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
    {
      scope: 'instagram_business_content_publish',
      purpose: 'Đăng nội dung sau khi user approve',
      dataRetentionDays: 0,
      sensitivityLevel: 'sensitive',
    },
  ],
  notes: 'Không cần Facebook Page. Cần IG Business/Creator, thêm làm Instagram Tester và accept invite trong app Instagram. Token dài hạn 60 ngày, tự refresh. User phải có task MANAGE hoặc CREATE_CONTENT.',
}

const IG_AUTH_URL = 'https://www.instagram.com/oauth/authorize'
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const IG_GRAPH_URL = 'https://graph.instagram.com'
const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/instagram/callback`]
const DEFAULT_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish']

/**
 * Chuẩn hóa lỗi trả về từ Meta Graph API.
 * ĐIỂM CHÍ MẠNG: Meta thỉnh thoảng trả `{"error":{"message":"Timeout"}}`
 * khi server Instagram không tải kịp media từ URL (host ảnh chậm, file
 * lớn, hoặc nghẽn nhất thời phía Meta). Đây là lỗi NHẤT THỜI — phải cho
 * worker retry với backoff, TUYỆT ĐỐI không được fail job vĩnh viễn chỉ
 * vì message "Timeout" khô khốc của Meta.
 */
export function asInstagramError(err: unknown, step: string, httpStatus?: number): OrhError {
  const msg: string =
    (err as { error?: { message?: string } })?.error?.message ?? ''
  if (/(timed?\s*out|timeout)/i.test(msg)) {
    return new OrhError(
      'TRANSIENT_NETWORK_ERROR',
      `Instagram không tải kịp media từ link ở bước ${step} (Meta báo Timeout). ` +
        `Thường do host ảnh phản hồi chậm hoặc file quá lớn — hệ thống sẽ tự thử lại. ` +
        `Nếu vẫn lặp lại, hãy dùng link ảnh trực tiếp (i.ibb.co) và nén ảnh dưới 1MB.`,
      true,
      'instagram',
    )
  }
  const statusPart = httpStatus ? ` (HTTP ${httpStatus})` : ''
  return new OrhError(
    'CONTENT_REJECTED',
    `Instagram từ chối ở bước ${step}${statusPart}: ${msg || 'không rõ nguyên nhân'}.`,
    false,
    'instagram',
  )
}

export class InstagramConnector implements SocialConnector {
  provider(): Provider { return 'instagram' }
  manifest(): PermissionManifest { return INSTAGRAM_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    // Instagram Login không dùng PKCE → build URL thủ công, không gắn code_challenge
    const url = new URL(IG_AUTH_URL)
    url.searchParams.set('client_id', requiredEnv('instagram', 'INSTAGRAM_APP_ID'))
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', (input.scopes ?? DEFAULT_SCOPES).join(' '))
    url.searchParams.set('state', input.state)
    return url.toString()
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    // Instagram trả code kèm hậu tố '#_' — strip trước khi dùng
    const code = input.code.split('#')[0]
    const appId = requiredEnv('instagram', 'INSTAGRAM_APP_ID')
    const appSecret = requiredEnv('instagram', 'INSTAGRAM_APP_SECRET')

    // 1. code → short-lived token (+ user_id)
    const res = await fetch(IG_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = body?.error?.message
        ? `Meta: ${body.error.message}${body.error.code ? ` (code ${body.error.code})` : ''}`
        : `Meta HTTP ${res.status}`
      throw new OrhError('TRANSIENT_NETWORK_ERROR', `Token exchange failed (${detail}).`, true, 'instagram')
    }
    const d = await res.json()
    const shortToken: string | undefined = d.access_token ?? d.data?.[0]?.access_token
    if (!shortToken) throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Instagram không trả access_token.', true, 'instagram')

    // 2. short-lived → long-lived (60 ngày). Meta chỉ document dạng GET
    // server-to-server; secret không bao giờ lộ ra browser.
    const llRes = await fetch(
      `${IG_GRAPH_URL}/access_token?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&access_token=${encodeURIComponent(shortToken)}`,
    )
    if (!llRes.ok) {
      const body = await llRes.json().catch(() => ({}))
      const detail = body?.error?.message
        ? `Meta: ${body.error.message}${body.error.code ? ` (code ${body.error.code})` : ''}`
        : `Meta HTTP ${llRes.status}`
      throw new OrhError('TRANSIENT_NETWORK_ERROR', `Long-lived token exchange failed (${detail}).`, true, 'instagram')
    }
    const ll = await llRes.json()
    return {
      accessToken: ll.access_token,
      expiresAt: new Date(Date.now() + (ll.expires_in ?? 5184000) * 1000),
      scopes: [],
      tokenType: 'Bearer',
    }
  }

  async refresh(connection: Connection): Promise<TokenSet> {
    const token = decrypt(connection.encryptedAccessToken)
    const res = await fetch(
      `${IG_GRAPH_URL}/refresh_access_token?grant_type=ig_refresh_token` +
        `&access_token=${encodeURIComponent(token)}`,
    )
    if (!res.ok) throw new OrhError('TOKEN_EXPIRED', 'Instagram token refresh failed.', true, 'instagram')
    const d = await res.json()
    return {
      accessToken: d.access_token,
      expiresAt: new Date(Date.now() + (d.expires_in ?? 5184000) * 1000),
      scopes: [],
      tokenType: 'Bearer',
    }
  }

  async getIdentity(connection: Connection): Promise<ProviderIdentity> {
    const token = decrypt(connection.encryptedAccessToken)
    // A2: token qua Authorization header, KHÔNG qua query string
    const res = await fetch(`${IG_GRAPH_URL}/me?fields=id,username`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new OrhError('TOKEN_EXPIRED', 'Instagram token invalid.', true, 'instagram')
    const d = await res.json()
    return { providerUserId: d.id, displayName: d.username }
  }

  async revoke(connection: Connection): Promise<void> {
    // Instagram không có revoke endpoint → xóa token phía local.
    // User gỡ quyền trong Instagram app: Settings → Apps and websites.
  }

  /**
   * Publish flow:
   * 1 ảnh: POST /{ig-user-id}/media → tạo container → POST /media_publish.
   * 1 video: container với video_url + media_type=REELS → chờ FINISHED → publish.
   * Nhiều ảnh: tạo từng item container (is_carousel_item=true), gom thành
   * carousel container (media_type=CAROUSEL + children), rồi publish.
   * Carousel có video chưa hỗ trợ → báo lỗi rõ ràng (đăng video riêng lẻ).
   *
   * KHÔNG tự động publish — phải có approval_status = 'approved'
   */
  async publish(input: PublishInput): Promise<PublishResult> {
    const token = decrypt(input.connection.encryptedAccessToken)
    const igUserId = input.connection.providerUserId
    // Loại media: ưu tiên kết quả probe từ worker (mediaKinds), fallback đoán
    // theo đuôi file nếu connector được gọi trực tiếp mà không qua worker.
    const kinds = input.mediaKinds ?? input.mediaUrls.map((u) => detectMediaKind(u))

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }

    const createContainer = async (body: Record<string, unknown>): Promise<string> => {
      const res = await fetch(`${IG_GRAPH_URL}/${igUserId}/media`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.error?.code === 36000) {
          throw new OrhError('RATE_LIMITED', 'Đạt giới hạn 400 containers/24h.', false, 'instagram')
        }
        throw asInstagramError(err, 'tạo container')
      }
      const { id } = await res.json()
      return id as string
    }

    /**
     * Poll trạng thái container cho tới khi FINISHED (tối đa 60s, mỗi 3s một lần).
     * ERROR/EXPIRED → lỗi vĩnh viễn; timeout → retryable để worker thử lại sau.
     */
    const waitContainerReady = async (cid: string): Promise<void> => {
      const deadline = Date.now() + 60000
      for (;;) {
        const res = await fetch(`${IG_GRAPH_URL}/${cid}?fields=status_code`, { headers })
        const d = (await res.json().catch(() => ({}))) as { status_code?: string }
        const status = d.status_code
        if (status === 'FINISHED') return
        if (status === 'ERROR' || status === 'EXPIRED') {
          throw new OrhError(
            'CONTENT_REJECTED',
            `Instagram không xử lý được ảnh/video (container ${status}). Kiểm tra lại link ảnh.`,
            false,
            'instagram',
          )
        }
        if (Date.now() >= deadline) {
          throw new OrhError(
            'CONTENT_REJECTED',
            'Instagram xử lý ảnh quá lâu (timeout 60s), sẽ thử lại sau.',
            true,
            'instagram',
          )
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    let containerId: string
    if (input.mediaUrls.length === 1 && kinds[0] === 'video') {
      // 1 video → đăng dạng Reels (video_url + media_type=REELS)
      containerId = await createContainer({
        video_url: input.mediaUrls[0],
        media_type: 'REELS',
        caption: input.caption,
      })
    } else if (input.mediaUrls.length > 1) {
      if (kinds.some((k) => k === 'video')) {
        throw new OrhError(
          'CONTENT_REJECTED',
          'Carousel có video chưa được hỗ trợ — hãy đăng video riêng lẻ (1 video/bài, sẽ lên dạng Reels).',
          false,
          'instagram',
        )
      }
      // Carousel: mỗi ảnh một item container, caption gắn ở carousel cha
      const children: string[] = []
      for (const image_url of input.mediaUrls) {
        const childId = await createContainer({ image_url, is_carousel_item: true })
        await waitContainerReady(childId)
        children.push(childId)
      }
      containerId = await createContainer({
        media_type: 'CAROUSEL',
        children,
        caption: input.caption,
      })
    } else {
      // Step 1: Tạo container
      containerId = await createContainer({
        image_url: input.mediaUrls[0],
        caption: input.caption,
      })
    }

    // BẮT BUỘC: chờ Instagram xử lý xong container (status FINISHED) rồi mới
    // publish — publish quá sớm sẽ bị lỗi 400 "Media ID is not available".
    await waitContainerReady(containerId)

    // Step 2: Publish container
    const publishRes = await fetch(`${IG_GRAPH_URL}/${igUserId}/media_publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ creation_id: containerId }),
    })
    if (!publishRes.ok) {
      const err = await publishRes.json().catch(() => ({}))
      throw asInstagramError(err, 'publish', publishRes.status)
    }
    const { id: mediaId } = await publishRes.json()
    return {
      platformPostId: mediaId,
      url: `https://www.instagram.com/p/${mediaId}`,
      status: 'published',
    }
  }
}
