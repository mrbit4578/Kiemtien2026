import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider, PublishInput, PublishResult, MediaKind } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError, detectMediaKind } from '@orh/shared'

/**
 * TikTok connector
 *
 * Login Kit: https://developers.tiktok.com/products/login-kit
 * Content Posting API (Direct Post):
 * https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
 *
 * Luồng đăng video trực tiếp (Direct Post):
 * 1. POST /v2/post/publish/video/init/  → nhận publish_id + upload_url
 * 2. PUT từng chunk (10MB) lên upload_url với Content-Range
 * 3. POST /v2/post/publish/status/fetch/ → chờ PUBLISH_COMPLETE
 *
 * QUAN TRỌNG (luật của TikTok, không phải bug code):
 * - Client chưa audit: video BẮT BUỘC ở private viewing mode (SELF_ONLY).
 *   Đăng lên tài khoản public sẽ bị chặn ngay ở bước init với mã
 *   `unaudited_client_can_only_post_to_private_accounts`.
 * - Muốn gỡ giới hạn: client phải qua audit TOS của TikTok.
 * - Token phải có scope `video.publish` — product "Content Posting API" đã được
 *   thêm + bật Direct Post cho cả app Production và Sandbox (2026-09-23),
 *   nên scope authorize mặc định đã gồm video.publish. Token cũ (chỉ có
 *   user.info.basic, cấp trước khi bật product) phải Kết nối lại mới đăng được.
 */

export const TIKTOK_MANIFEST: PermissionManifest = {
  provider: 'tiktok',
  reviewStatus: 'pending_review',
  requiredForMvp: true,
  scopes: [
    {
      scope: 'user.info.basic',
      purpose: 'Thông tin cơ bản tài khoản TikTok',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
    {
      scope: 'video.publish',
      purpose: 'Đăng video trực tiếp lên TikTok (Direct Post). App chưa audit → video ở chế độ riêng tư (SELF_ONLY)',
      dataRetentionDays: 0,
      sensitivityLevel: 'sensitive',
    },
  ],
  notes: 'Direct Post đã implement (init -> chunk PUT 10MB -> poll status). Product "Content Posting API" + Direct Post đã bật cho cả Production và Sandbox (2026-09-23); scope authorize gồm user.info.basic + video.publish. Token cấp trước thời điểm này phải Kết nối lại. App chưa audit → video bắt buộc SELF_ONLY (private); tài khoản public bị chặn ở bước init. Muốn đăng công khai phải chờ TikTok audit & duyệt app.',
}

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize'
const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/tiktok/callback`]

const TIKTOK_API_BASE = 'https://open.tiktokapis.com'
/** Kích thước mỗi chunk upload (10MB — đúng ví dụ trong docs TikTok). */
const TIKTOK_CHUNK_SIZE = 10 * 1024 * 1024
/** Giới hạn video cho pipeline TikTok (khớp limit 100MB của endpoint upload-video). */
const TIKTOK_MAX_VIDEO_BYTES = 100 * 1024 * 1024
/** Giới hạn caption của TikTok (2200 ký tự UTF-16). */
const TIKTOK_TITLE_LIMIT = 2200

/** Content-Type cho chunk upload theo đuôi file. */
function chunkContentType(url: string): string {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  if (clean.endsWith('.mov')) return 'video/quicktime'
  if (clean.endsWith('.webm')) return 'video/webm'
  return 'video/mp4'
}

export class TikTokConnector implements SocialConnector {
  provider(): Provider { return 'tiktok' }
  manifest(): PermissionManifest { return TIKTOK_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    return buildOAuthUrl(TIKTOK_AUTH_URL, {
      clientId: requiredEnv('tiktok', 'TIKTOK_CLIENT_KEY'),
      redirectUri: input.redirectUri,
      // Scope video.publish thuộc product "Content Posting API" — đã bật cho cả
      // app Production và Sandbox (Direct Post = ON), nên xin luôn ở đây.
      // Token cũ (chỉ có user.info.basic) phải Kết nối lại mới có quyền mới.
      // QUAN TRỌNG: TikTok yêu cầu các scope phân cách bằng DẤU PHẨY
      // (scope=user.info.basic,video.publish). Nối bằng dấu cách làm TikTok
      // hiểu thành 1 scope lạ duy nhất và chặn cứng trang authorize với lỗi
      // "Something went wrong ... correct the following: scope".
      scopes: input.scopes ?? ['user.info.basic', 'video.publish'],
      scopeSeparator: ',',
      state: input.state,
      codeChallenge: input.codeChallenge,
      extra: { client_key: requiredEnv('tiktok', 'TIKTOK_CLIENT_KEY') },
    })
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: requiredEnv('tiktok', 'TIKTOK_CLIENT_KEY'),
        client_secret: requiredEnv('tiktok', 'TIKTOK_CLIENT_SECRET'),
        code: input.code,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }),
    })
    if (!res.ok) throw new OrhError('TRANSIENT_NETWORK_ERROR', 'TikTok token exchange failed.', true, 'tiktok')
    const d = await res.json()
    // TikTok trả token ở TOP-LEVEL (không bọc trong `data` như user/info) —
    // xem https://developers.tiktok.com/docs/en/oauth-user-access-token-management
    // Nếu thiếu access_token thì ném lỗi RÕ RÀNG ngay tại đây, đừng để
    // encrypt(undefined) nổ TypeError rồi bị hiểu nhầm thành lỗi key mã hóa.
    if (!d.access_token) {
      const reason = d.error_description ?? d.error ?? 'không rõ nguyên nhân'
      throw new Error(`TikTok từ chối đổi code lấy token: ${reason}`)
    }
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt: new Date(Date.now() + (d.expires_in ?? 86400) * 1000),
      scopes: (d.scope ?? '').split(',').filter(Boolean),
      tokenType: 'Bearer',
    }
  }

  async getIdentity(connection: Connection): Promise<ProviderIdentity> {
    const token = decrypt(connection.encryptedAccessToken)
    const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,open_id', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new OrhError('TOKEN_EXPIRED', 'TikTok token invalid.', true, 'tiktok')
    const d = await res.json()
    return {
      providerUserId: d.data?.user?.open_id,
      displayName: d.data?.user?.display_name,
    }
  }

  async revoke(connection: Connection): Promise<void> {
    const token = decrypt(connection.encryptedAccessToken)
    await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    })
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    // TikTok Direct Post: đúng 1 video cho mỗi lần đăng.
    const kinds: MediaKind[] = input.mediaKinds?.length
      ? input.mediaKinds
      : input.mediaUrls.map((u) => detectMediaKind(u))
    const videoIdx = kinds.findIndex((k) => k === 'video')
    if (videoIdx === -1) {
      throw new OrhError(
        'CONTENT_REJECTED',
        'TikTok chỉ đăng được video (MP4/MOV/WebM). Hãy tải video lên rồi đăng lại.',
        false,
        'tiktok',
      )
    }
    const videoUrl = input.mediaUrls[videoIdx]
    const token = decrypt(input.connection.encryptedAccessToken)

    // Tải video về server rồi upload chunk lên TikTok (FILE_UPLOAD).
    // PULL_FROM_URL yêu cầu verify quyền sở hữu domain — không dùng được
    // với domain Cloudinary của mình.
    const video = await downloadVideoBytes(videoUrl)
    const title = (input.caption ?? '').slice(0, TIKTOK_TITLE_LIMIT)

    // ── B1: khởi tạo phiên đăng ──────────────────────────────────────
    const totalChunks = Math.max(1, Math.ceil(video.length / TIKTOK_CHUNK_SIZE))
    let initRes: Response
    try {
      initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title,
            // App chưa audit → TikTok BẮT BUỘC SELF_ONLY (private).
            privacy_level: 'SELF_ONLY',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            brand_content_toggle: false,
            brand_organic_toggle: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: video.length,
            chunk_size: TIKTOK_CHUNK_SIZE,
            total_chunk_count: totalChunks,
          },
        }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      throw new OrhError(
        'TRANSIENT_NETWORK_ERROR',
        `Không kết nối được tới TikTok (${err instanceof Error ? err.message : String(err)}). Hệ thống sẽ tự thử lại.`,
        true,
        'tiktok',
      )
    }
    const initData = (await initRes.json().catch(() => null)) as {
      data?: { publish_id?: string; upload_url?: string }
      error?: { code?: string; message?: string }
    } | null
    const initErr = initData?.error
    if (!initRes.ok || initErr?.code !== 'ok' || !initData?.data?.publish_id) {
      throw tiktokApiError(initRes.status, initErr?.code ?? '', initErr?.message ?? '')
    }
    const publishId = initData.data.publish_id as string
    const uploadUrl = initData.data.upload_url
    if (!uploadUrl) {
      throw new OrhError('CONTENT_REJECTED', 'TikTok không trả upload_url.', false, 'tiktok')
    }

    // ── B2: upload từng chunk theo thứ tự ─────────────────────────────
    const contentType = chunkContentType(videoUrl)
    for (let i = 0; i < totalChunks; i++) {
      const start = i * TIKTOK_CHUNK_SIZE
      const end = Math.min(start + TIKTOK_CHUNK_SIZE, video.length) - 1
      const chunk = video.subarray(start, end + 1)
      let upRes: Response
      try {
        upRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${start}-${end}/${video.length}`,
          },
          // @ts-expect-error undici-types: body nhận Uint8Array/Buffer
          body: chunk,
          signal: AbortSignal.timeout(120000),
        })
      } catch (err) {
        throw new OrhError(
          'TRANSIENT_NETWORK_ERROR',
          `Upload chunk ${i + 1}/${totalChunks} lên TikTok thất bại (${err instanceof Error ? err.message : String(err)}). Hệ thống sẽ tự thử lại.`,
          true,
          'tiktok',
        )
      }
      if (!upRes.ok) {
        if (upRes.status === 429 || upRes.status >= 500) {
          throw new OrhError(
            'TRANSIENT_NETWORK_ERROR',
            `TikTok lỗi khi nhận chunk ${i + 1}/${totalChunks} (HTTP ${upRes.status}). Hệ thống sẽ tự thử lại.`,
            true,
            'tiktok',
          )
        }
        throw new OrhError(
          'CONTENT_REJECTED',
          `TikTok từ chối chunk ${i + 1}/${totalChunks} (HTTP ${upRes.status}).`,
          false,
          'tiktok',
        )
      }
    }

    // ── B3: chờ TikTok xử lý xong ─────────────────────────────────────
    const finalStatus = await waitForPublishComplete(token, publishId)
    if (finalStatus === 'FAILED') {
      throw new OrhError(
        'CONTENT_REJECTED',
        'TikTok xử lý video thất bại (FAILED). Hãy kiểm tra lại định dạng/dung lượng video rồi đăng lại.',
        false,
        'tiktok',
      )
    }
    return {
      platformPostId: publishId,
      status: 'private',
      warning:
        finalStatus === 'PUBLISH_COMPLETE'
          ? 'Đã đăng lên TikTok ở chế độ Riêng tư (luật của TikTok: app chưa qua kiểm duyệt chỉ được đăng private). Muốn đăng công khai, app cần được TikTok audit & duyệt.'
          : 'Video đã được tải lên TikTok và đang chờ xử lý — hãy kiểm tra trong app TikTok (mục video riêng tư). App chưa audit nên video chỉ ở chế độ Riêng tư.',
    }
  }
}

/** Tải video về buffer để upload chunk lên TikTok (giới hạn 100MB). */
async function downloadVideoBytes(url: string): Promise<Buffer> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120000) })
  } catch (err) {
    throw new OrhError(
      'TRANSIENT_NETWORK_ERROR',
      `Không tải được video để đăng TikTok (${err instanceof Error ? err.message : String(err)}). Hệ thống sẽ tự thử lại.`,
      true,
      'tiktok',
    )
  }
  if (!res.ok) {
    throw new OrhError(
      'CONTENT_REJECTED',
      `Không tải được video (HTTP ${res.status}) — link có thể đã hỏng.`,
      false,
      'tiktok',
    )
  }
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > TIKTOK_MAX_VIDEO_BYTES) {
    throw new OrhError(
      'CONTENT_REJECTED',
      `Video quá lớn (${Math.round(declared / 1048576)}MB > 100MB) — pipeline TikTok chỉ nhận tối đa 100MB.`,
      false,
      'tiktok',
    )
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) {
    throw new OrhError('CONTENT_REJECTED', 'Video rỗng (0 byte).', false, 'tiktok')
  }
  if (buf.length > TIKTOK_MAX_VIDEO_BYTES) {
    throw new OrhError(
      'CONTENT_REJECTED',
      `Video quá lớn (${Math.round(buf.length / 1048576)}MB > 100MB) — pipeline TikTok chỉ nhận tối đa 100MB.`,
      false,
      'tiktok',
    )
  }
  return buf
}

/** Map mã lỗi của TikTok Content Posting API sang OrhError. */
function tiktokApiError(httpStatus: number, code: string, message: string): OrhError {
  const msg = message?.trim()
  switch (code) {
    case 'scope_not_authorized':
      return new OrhError(
        'PROVIDER_REAUTH_REQUIRED',
        'TikTok từ chối: token chưa có quyền đăng video (video.publish). Hãy chắc chắn app đã bật product "Content Posting API" + Direct Post trong Developer Portal, rồi vào mục Kết nối → ngắt kết nối TikTok → Kết nối lại để cấp quyền mới, rồi đăng lại.',
        false,
        'tiktok',
      )
    case 'access_token_invalid':
      return new OrhError(
        'TOKEN_EXPIRED',
        'Token TikTok không hợp lệ hoặc đã hết hạn. Hãy ngắt kết nối và Kết nối lại TikTok.',
        true,
        'tiktok',
      )
    case 'unaudited_client_can_only_post_to_private_accounts':
      return new OrhError(
        'PROVIDER_REVIEW_REQUIRED',
        'TikTok từ chối: app chưa qua kiểm duyệt (audit) nên chỉ đăng được lên tài khoản đặt ở chế độ Riêng tư (Private). Hãy vào TikTok → Settings → Privacy → bật Private account rồi thử lại; muốn đăng công khai phải chờ TikTok duyệt app.',
        false,
        'tiktok',
      )
    case 'rate_limit_exceeded':
      return new OrhError(
        'RATE_LIMITED',
        'TikTok giới hạn 6 lượt đăng/phút. Hệ thống sẽ tự thử lại.',
        true,
        'tiktok',
      )
    case 'spam_risk_too_many_posts':
    case 'spam_risk_user_banned_from_posting':
    case 'reached_active_user_cap':
      return new OrhError('CONTENT_REJECTED', `TikTok từ chối đăng (${msg || code}).`, false, 'tiktok')
    default:
      break
  }
  if (httpStatus === 429) {
    return new OrhError('RATE_LIMITED', 'TikTok giới hạn tần suất. Hệ thống sẽ tự thử lại.', true, 'tiktok')
  }
  if (httpStatus >= 500) {
    return new OrhError(
      'TRANSIENT_NETWORK_ERROR',
      `TikTok lỗi server (HTTP ${httpStatus}). Hệ thống sẽ tự thử lại.`,
      true,
      'tiktok',
    )
  }
  return new OrhError(
    'CONTENT_REJECTED',
    `TikTok từ chối đăng (${msg || code || `HTTP ${httpStatus}`}).`,
    false,
    'tiktok',
  )
}

/** Poll trạng thái xử lý video của TikTok (tối đa ~90s). */
async function waitForPublishComplete(token: string, publishId: string): Promise<string> {
  const deadline = Date.now() + 90000
  let status = ''
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000))
    let res: Response
    try {
      res = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      continue
    }
    const d = (await res.json().catch(() => null)) as {
      data?: { status?: string }
    } | null
    status = d?.data?.status ?? ''
    if (status === 'PUBLISH_COMPLETE' || status === 'FAILED') return status
  }
  return status || 'PROCESSING'
}
