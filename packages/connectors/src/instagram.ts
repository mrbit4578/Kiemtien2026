import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider, PublishInput, PublishResult } from '@orh/shared'
import { validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

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
 * Yêu cầu trên dashboard Meta: thêm product "Instagram" → chọn
 * "API setup with Instagram login", khai báo redirect URI trong product đó,
 * tài khoản IG phải là Business/Creator, được thêm làm Instagram Tester
 * và accept invite trong app Instagram.
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

export class InstagramConnector implements SocialConnector {
  provider(): Provider { return 'instagram' }
  manifest(): PermissionManifest { return INSTAGRAM_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    // Instagram Login không dùng PKCE → build URL thủ công, không gắn code_challenge
    const url = new URL(IG_AUTH_URL)
    url.searchParams.set('client_id', requiredEnv('instagram', 'META_APP_ID'))
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
    const appId = requiredEnv('instagram', 'META_APP_ID')
    const appSecret = requiredEnv('instagram', 'META_APP_SECRET')

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
    if (!res.ok) throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Instagram token exchange failed.', true, 'instagram')
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
    if (!llRes.ok) throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Instagram long-lived token exchange failed.', true, 'instagram')
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
   * 1. POST /{ig-user-id}/media → tạo container
   * 2. POST /{ig-user-id}/media_publish → publish container
   *
   * KHÔNG tự động publish — phải có approval_status = 'approved'
   */
  async publish(input: PublishInput): Promise<PublishResult> {
    const token = decrypt(input.connection.encryptedAccessToken)
    const igUserId = input.connection.providerUserId

    // Step 1: Tạo container
    const containerRes = await fetch(`${IG_GRAPH_URL}/${igUserId}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image_url: input.mediaUrls[0],
        caption: input.caption,
      }),
    })
    if (!containerRes.ok) {
      const err = await containerRes.json().catch(() => ({}))
      if (err.error?.code === 36000) {
        throw new OrhError('RATE_LIMITED', 'Đạt giới hạn 400 containers/24h.', false, 'instagram')
      }
      throw new OrhError('CONTENT_REJECTED', err.error?.message ?? 'Container creation failed.', false, 'instagram')
    }
    const { id: containerId } = await containerRes.json()

    // Step 2: Publish container
    const publishRes = await fetch(`${IG_GRAPH_URL}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ creation_id: containerId }),
    })
    if (!publishRes.ok) {
      throw new OrhError('CONTENT_REJECTED', 'Instagram publish failed.', false, 'instagram')
    }
    const { id: mediaId } = await publishRes.json()
    return {
      platformPostId: mediaId,
      url: `https://www.instagram.com/p/${mediaId}`,
      status: 'published',
    }
  }
}
