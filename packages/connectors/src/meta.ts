import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

/**
 * Meta (Facebook) OAuth connector
 *
 * Ref: https://developers.facebook.com/documentation/development/permissions
 * - Mỗi permission được user cấp riêng lẻ (granular)
 * - Advanced Access có thể yêu cầu Business Verification
 */

export const META_MANIFEST: PermissionManifest = {
  provider: 'facebook',
  reviewStatus: 'pending_review',
  requiredForMvp: true,
  scopes: [
    {
      scope: 'public_profile',
      purpose: 'Tên và ảnh đại diện',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
  ],
  notes: 'Chỉ xin public_profile để tránh lỗi Invalid Scopes (scope email cần bật riêng trong dashboard). Định danh qua Facebook user ID.',
}

const META_AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth'
const META_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token'
const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/facebook/callback`]

export class MetaConnector implements SocialConnector {
  provider(): Provider { return 'facebook' }
  manifest(): PermissionManifest { return META_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    return buildOAuthUrl(META_AUTH_URL, {
      clientId: requiredEnv('facebook', 'META_APP_ID'),
      redirectUri: input.redirectUri,
      scopes: input.scopes ?? ['public_profile'],
      state: input.state,
      codeChallenge: input.codeChallenge,
    })
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    // A2: client_secret và code đi trong POST body, KHÔNG qua query string
    const res = await fetch(META_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: requiredEnv('facebook', 'META_APP_ID'),
        redirect_uri: input.redirectUri,
        client_secret: requiredEnv('facebook', 'META_APP_SECRET'),
        code: input.code,
      }),
    })
    if (!res.ok) {
      // Đọc message lỗi thật của Meta để chẩn đoán (không bao giờ chứa secret)
      const body = await res.json().catch(() => ({}))
      const detail = body?.error?.message
        ? `Meta: ${body.error.message}${body.error.code ? ` (code ${body.error.code})` : ''}`
        : `Meta HTTP ${res.status}`
      throw new OrhError('TRANSIENT_NETWORK_ERROR', `Token exchange failed (${detail}).`, true, 'facebook')
    }

    const data = await res.json()
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      scopes: [],
      tokenType: 'Bearer',
    }
  }

  async getIdentity(connection: Connection): Promise<ProviderIdentity> {
    const token = decrypt(connection.encryptedAccessToken)
    // A2: token qua Authorization header, KHÔNG qua query string
    const res = await fetch('https://graph.facebook.com/me?fields=id,name,email', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new OrhError('TOKEN_EXPIRED', 'Meta token invalid.', true, 'facebook')
    const d = await res.json()
    return { providerUserId: d.id, displayName: d.name, email: d.email }
  }

  async revoke(connection: Connection): Promise<void> {
    const token = decrypt(connection.encryptedAccessToken)
    await fetch(
      `https://graph.facebook.com/${connection.providerUserId}/permissions`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    )
  }
}
