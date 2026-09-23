import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider, PublishInput, PublishResult } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

/**
 * TikTok connector
 *
 * Login Kit: https://developers.tiktok.com/products/login-kit
 * Content Posting API: https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
 *
 * QUAN TRỌNG:
 * - Client chưa audit: nội dung bị đặt ở private viewing mode
 * - Muốn gỡ giới hạn visibility: client phải qua audit TOS
 * - UI phải hiển thị "Cần review" cho tính năng publish
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
      purpose: 'Đăng video sau khi user approve (chưa audit: private mode)',
      dataRetentionDays: 0,
      sensitivityLevel: 'sensitive',
    },
  ],
  notes: 'Publish bị giới hạn private cho đến khi qua audit. Hiển thị cảnh báo rõ ràng trong UI.',
}

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize'
const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/tiktok/callback`]

export class TikTokConnector implements SocialConnector {
  provider(): Provider { return 'tiktok' }
  manifest(): PermissionManifest { return TIKTOK_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    return buildOAuthUrl(TIKTOK_AUTH_URL, {
      clientId: requiredEnv('tiktok', 'TIKTOK_CLIENT_KEY'),
      redirectUri: input.redirectUri,
      scopes: input.scopes ?? ['user.info.basic'],
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
    // CẢNH BÁO: Client chưa audit → nội dung sẽ ở private mode
    throw new OrhError(
      'PROVIDER_REVIEW_REQUIRED',
      'TikTok publish cần app audit. Nội dung sẽ ở private mode cho đến khi đủ điều kiện.',
      false,
      'tiktok',
    )
  }
}
