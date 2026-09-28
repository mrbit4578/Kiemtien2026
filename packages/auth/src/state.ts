import { randomBytes } from 'crypto'

export interface OAuthState {
  value: string
  workspaceId: string
  provider: string
  codeVerifier: string
  redirectUri: string
  expiresAt: number // unix ms
}

const TTL_MS = 10 * 60 * 1000 // 10 phút

/**
 * Tạo state ngẫu nhiên 1 lần, có TTL ngắn.
 * KHÔNG log state hay codeVerifier.
 */
export function createOAuthState(input: Omit<OAuthState, 'value' | 'expiresAt'>): OAuthState {
  return {
    ...input,
    value: randomBytes(32).toString('hex'),
    expiresAt: Date.now() + TTL_MS,
  }
}

export function validateOAuthState(
  stored: OAuthState,
  received: string,
): void {
  if (stored.value !== received) {
    throw new Error('Invalid state: CSRF detected.')
  }
  if (Date.now() > stored.expiresAt) {
    throw new Error('State expired.')
  }
}

/**
 * Kiểm tra redirect URI có nằm trong allowlist không.
 * Không bao giờ lấy redirect URI từ query parameter.
 */
export function validateRedirectUri(uri: string, allowlist: string[]): void {
  if (!allowlist.includes(uri)) {
    throw new Error(`Invalid redirect URI: ${uri}`)
  }
}
