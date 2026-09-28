import { randomBytes, createHash } from 'crypto'

/**
 * Tạo PKCE code_verifier và code_challenge.
 * Spec: https://www.rfc-editor.org/rfc/rfc7636
 */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  // code_verifier: 43–128 ký tự URL-safe
  const codeVerifier = randomBytes(48).toString('base64url')

  // code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  return { codeVerifier, codeChallenge }
}

export function buildOAuthUrl(
  authorizationEndpoint: string,
  params: {
    clientId: string
    redirectUri: string
    scopes: string[]
    state: string
    codeChallenge: string
    extra?: Record<string, string>
    // Ký tự phân cách các scope trong query `scope`. Mặc định dấu cách
    // (chuẩn OAuth2: Google, GitHub...). TikTok BẮT BUỘC phân cách bằng dấu
    // PHẨY — nối bằng dấu cách làm TikTok hiểu thành 1 scope lạ duy nhất và
    // chặn cứng trang authorize với lỗi "correct the following: scope".
    // (Bằng chứng: scope TikTok trả về trong token response cũng phân cách
    // bằng phẩy, xem exchangeCode của tiktok connector.)
    scopeSeparator?: string
  },
): string {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', params.scopes.join(params.scopeSeparator ?? ' '))
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  if (params.extra) {
    for (const [k, v] of Object.entries(params.extra)) {
      url.searchParams.set(k, v)
    }
  }

  return url.toString()
}
