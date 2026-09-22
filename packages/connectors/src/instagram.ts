import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider, PublishInput, PublishResult } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

/**
 * Instagram connector (Instagram API with Facebook Login for Business)
 *
 * Meta đã khai tử Instagram Basic Display (api.instagram.com) — luồng mới:
 * 1. Facebook Login dialog (www.facebook.com/vXX/dialog/oauth) với scope instagram_*
 * 2. Đổi code tại graph.facebook.com/vXX/oauth/access_token
 * 3. Lấy IG professional account qua /me/accounts?fields=instagram_business_account
 * 4. Publish qua /{ig-user-id}/media + /{ig-user-id}/media_publish
 *
 * Yêu cầu: tài khoản Instagram professional (business/creator) đã liên kết
 * với một Facebook Page mà user quản lý.
 *
 * Publish flow:
 * 1. Tạo container (media object)
 * 2. Publish container
 * Container hết hạn sau 24 giờ; giới hạn 400 container/24h
 *
 * Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login
 */

export const INSTAGRAM_MANIFEST: PermissionManifest = {
  provider: 'instagram',
  reviewStatus: 'pending_review',
  requiredForMvp: true,
  scopes: [
    {
      scope: 'instagram_basic',
      purpose: 'Xem thông tin tài khoản professional',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
    {
      scope: 'instagram_content_publish',
      purpose: 'Đăng nội dung sau khi user approve',
      dataRetentionDays: 0,
      sensitivityLevel: 'sensitive',
    },
  ],
  notes: 'Cần tài khoản professional liên kết với Facebook Page. Container hết hạn 24h. Giới hạn 400 containers/24h. User phải có task MANAGE hoặc CREATE_CONTENT.',
}

const FB_DIALOG_URL = 'https://www.facebook.com/v19.0/dialog/oauth'
const FB_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token'
const GRAPH_URL = 'https://graph.facebook.com/v19.0'
const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/instagram/callback`]

export class InstagramConnector implements SocialConnector {
  provider(): Provider { return 'instagram' }
  manifest(): PermissionManifest { return INSTAGRAM_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    return buildOAuthUrl(FB_DIALOG_URL, {
      clientId: requiredEnv('instagram', 'META_APP_ID'),
      redirectUri: input.redirectUri,
      scopes: input.scopes ?? ['instagram_basic', 'instagram_content_publish'],
      state: input.state,
      codeChallenge: input.codeChallenge,
    })
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    // A2: client_secret và code đi trong POST body, KHÔNG qua query string
    const res = await fetch(FB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: requiredEnv('instagram', 'META_APP_ID'),
        redirect_uri: input.redirectUri,
        client_secret: requiredEnv('instagram', 'META_APP_SECRET'),
        code: input.code,
      }),
    })
    if (!res.ok) throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Instagram token exchange failed.', true, 'instagram')
    const d = await res.json()
    return {
      accessToken: d.access_token,
      expiresAt: new Date(Date.now() + (d.expires_in ?? 3600) * 1000),
      scopes: [],
      tokenType: 'Bearer',
    }
  }

  async getIdentity(connection: Connection): Promise<ProviderIdentity> {
    const token = decrypt(connection.encryptedAccessToken)
    // A2: token qua Authorization header, KHÔNG qua query string
    // Tìm IG professional account liên kết với Page user quản lý
    const res = await fetch(
      `${GRAPH_URL}/me/accounts?fields=id,name,instagram_business_account{id,username}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new OrhError('TOKEN_EXPIRED', 'Instagram token invalid.', true, 'instagram')
    const d = await res.json()
    const page = (d.data ?? []).find((p: any) => p.instagram_business_account?.id)
    if (!page) {
      throw new OrhError(
        'CONTENT_REJECTED',
        'Không tìm thấy tài khoản Instagram professional liên kết với Facebook Page. Hãy liên kết IG business/creator với Page rồi thử lại.',
        false,
        'instagram',
      )
    }
    return {
      providerUserId: page.instagram_business_account.id,
      displayName: page.instagram_business_account.username,
    }
  }

  async revoke(connection: Connection): Promise<void> {
    // Thu hồi quyền qua Graph API (best effort); user cũng có thể gỡ
    // qua Settings > Apps and Websites trên Facebook.
    const token = decrypt(connection.encryptedAccessToken)
    await fetch(`${GRAPH_URL}/${connection.providerUserId}/permissions`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
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
    const containerRes = await fetch(`${GRAPH_URL}/${igUserId}/media`, {
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
    const publishRes = await fetch(`${GRAPH_URL}/${igUserId}/media_publish`, {
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
