import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

/**
 * Google OAuth connector
 *
 * MVP: chỉ Google Sign-In (openid, profile, email)
 * Gmail scope nhạy cảm → cần Google OAuth App Verification riêng
 *
 * Ref: https://developers.google.com/identity/protocols/oauth2/web-server
 */

export const GOOGLE_MANIFEST: PermissionManifest = {
  provider: 'google',
  reviewStatus: 'approved',
  requiredForMvp: true,
  scopes: [
    {
      scope: 'openid',
      purpose: 'Xác thực người dùng',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
    {
      scope: 'profile',
      purpose: 'Hiển thị tên và ảnh đại diện',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
    {
      scope: 'email',
      purpose: 'Nhận dạng tài khoản (hash, không lưu plaintext)',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
    // Gmail scope — TẠM HOÃN đến M3+, cần App Verification
    // { scope: 'https://www.googleapis.com/auth/gmail.readonly', ... }
  ],
  notes: 'Gmail scope tạm hoãn. Xin scope hẹp nhất cho từng tính năng khi cần.',
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const ALLOWED_REDIRECT_URIS = [
  `${process.env.API_URL}/auth/google/callback`,
]

export class GoogleConnector implements SocialConnector {
  provider(): Provider { return 'google' }
  manifest(): PermissionManifest { return GOOGLE_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    return buildOAuthUrl(GOOGLE_AUTH_URL, {
      clientId: requiredEnv('google', 'GOOGLE_CLIENT_ID'),
      redirectUri: input.redirectUri,
      scopes: input.scopes ?? ['openid', 'profile', 'email'],
      state: input.state, // CSRF state ngẫu nhiên, do API layer sinh qua createOAuthState()
      codeChallenge: input.codeChallenge,
      extra: { access_type: 'offline', prompt: 'consent' },
    })
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: requiredEnv('google', 'GOOGLE_CLIENT_ID'),
        client_secret: requiredEnv('google', 'GOOGLE_CLIENT_SECRET'),
        code_verifier: input.codeVerifier,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      // KHÔNG log code hoặc client_secret
      throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Google token exchange failed.', true, 'google')
    }

    const data = await res.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: (data.scope ?? '').split(' '),
      tokenType: data.token_type,
    }
  }

  async getIdentity(connection: Connection): Promise<ProviderIdentity> {
    const accessToken = decrypt(connection.encryptedAccessToken)
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      if (res.status === 401) throw new OrhError('TOKEN_EXPIRED', 'Google token expired.', true, 'google')
      throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Google userinfo failed.', true, 'google')
    }
    const data = await res.json()
    return {
      providerUserId: data.sub,
      displayName: data.name,
      email: data.email,
      profileUrl: data.picture,
    }
  }

  async revoke(connection: Connection): Promise<void> {
    const accessToken = decrypt(connection.encryptedAccessToken)
    // A2: token đi trong POST body, KHÔNG qua query string
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken }),
    })
    // Bỏ qua lỗi revoke — token có thể đã expired
  }

  async refresh(connection: Connection): Promise<TokenSet> {
    if (!connection.encryptedRefreshToken) {
      throw new OrhError('PROVIDER_REAUTH_REQUIRED', 'Không có refresh token.', false, 'google')
    }
    const refreshToken = decrypt(connection.encryptedRefreshToken)
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: requiredEnv('google', 'GOOGLE_CLIENT_ID'),
        client_secret: requiredEnv('google', 'GOOGLE_CLIENT_SECRET'),
      }),
    })
    if (!res.ok) {
      throw new OrhError('PROVIDER_REAUTH_REQUIRED', 'Google refresh failed. Cần kết nối lại.', false, 'google')
    }
    const data = await res.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken, // rotation: dùng token mới nếu có
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: (data.scope ?? '').split(' '),
      tokenType: data.token_type,
    }
  }
}
