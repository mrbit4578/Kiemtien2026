import type { SocialConnector } from './interface';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider, PublishInput, PublishResult } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

/**
 * Instagram connector (Instagram Graph API via Facebook Login for Business)
 *
 * Publish flow:
 * 1. Tạo container (media object)
 * 2. Upload media
 * 3. Publish container
 * Container hết hạn sau 24 giờ; giới hạn 400 container/24h
 *
 * Ref: https://developers.facebook.com/docs/instagram-platform/
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
  notes: 'Cần tài khoản professional. Container hết hạn 24h. Giới hạn 400 containers/24h. User phải có task MANAGE hoặc CREATE_CONTENT.',
}

const IG_GRAPH_URL = 'https://graph.instagram.com'
const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/instagram/callback`]

export class InstagramConnector implements SocialConnector {
  provider(): Provider { return 'instagram' }
  manifest(): PermissionManifest { return INSTAGRAM_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    return buildOAuthUrl('https://api.instagram.com/oauth/authorize', {
      clientId: process.env.META_APP_ID!,
      redirectUri: input.redirectUri,
      scopes: input.scopes ?? ['instagram_basic'],
      state: input.state,
      codeChallenge: input.codeChallenge,
    })
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    const res = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code: input.code,
      }),
    })
    if (!res.ok) throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Instagram token exchange failed.', true, 'instagram')
    const d = await res.json()
    return {
      accessToken: d.access_token,
      expiresAt: new Date(Date.now() + 3600 * 1000),
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
    // Instagram không có revoke endpoint riêng → xóa token phía local
    // User revoke qua Settings > Apps and Websites trên Facebook
  }

  /**
   * Publish flow:
   * 1. POST /me/media → tạo container
   * 2. POST /me/media_publish → publish container
   *
   * KHÔNG tự động publish — phải có approval_status = 'approved'
   */
  async publish(input: PublishInput): Promise<PublishResult> {
    const token = decrypt(input.connection.encryptedAccessToken)
    const igUserId = input.connection.providerUserId

    // Step 1: Tạo container
    const containerRes = await fetch(`${IG_GRAPH_URL}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: input.mediaUrls[0],
        caption: input.caption,
        access_token: token,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: token }),
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
