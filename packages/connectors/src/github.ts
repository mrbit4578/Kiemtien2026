import type { SocialConnector } from './interface';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

export const GITHUB_MANIFEST: PermissionManifest = {
  provider: 'github',
  reviewStatus: 'approved',
  requiredForMvp: false,
  scopes: [
    {
      scope: 'read:user',
      purpose: 'Đăng nhập và hiển thị profile',
      dataRetentionDays: 0,
      sensitivityLevel: 'basic',
    },
  ],
  notes: 'Tùy chọn cho developer. Ưu tiên fine-grained token.',
}

const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/github/callback`]

export class GitHubConnector implements SocialConnector {
  provider(): Provider { return 'github' }
  manifest(): PermissionManifest { return GITHUB_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    return buildOAuthUrl('https://github.com/login/oauth/authorize', {
      clientId: process.env.GITHUB_CLIENT_ID!,
      redirectUri: input.redirectUri,
      scopes: ['read:user'],
      state: input.state,
      codeChallenge: input.codeChallenge,
    })
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }),
    })
    if (!res.ok) throw new OrhError('TRANSIENT_NETWORK_ERROR', 'GitHub token exchange failed.', true, 'github')
    const d = await res.json()
    return {
      accessToken: d.access_token,
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
      scopes: (d.scope ?? '').split(','),
      tokenType: d.token_type,
    }
  }

  async getIdentity(connection: Connection): Promise<ProviderIdentity> {
    const token = decrypt(connection.encryptedAccessToken)
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new OrhError('TOKEN_EXPIRED', 'GitHub token invalid.', true, 'github')
    const d = await res.json()
    return { providerUserId: String(d.id), displayName: d.login }
  }

  async revoke(_connection: Connection): Promise<void> {
    // GitHub không có revoke endpoint cho OAuth apps
    // User revoke qua github.com/settings/applications
  }
}
