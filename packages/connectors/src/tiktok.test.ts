import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Env phải set TRƯỚC khi module tiktok load (ALLOWED_REDIRECT_URIS tính lúc load).
process.env.API_URL = 'https://example.com'
process.env.TIKTOK_CLIENT_KEY = 'test_client_key'
process.env.TIKTOK_CLIENT_SECRET = 'test_client_secret'

// require (không phải import hoisted) để module load SAU khi env đã set.
const { TikTokConnector } = createRequire(__filename)('./tiktok')

const REDIRECT_URI = 'https://example.com/auth/tiktok/callback'

function mockFetch(jsonBody: unknown, ok = true) {
  globalThis.fetch = (async () =>
    ({
      ok,
      json: async () => jsonBody,
    }) as unknown as Response) as typeof fetch
}

describe('TikTokConnector.exchangeCode — parse đúng response của TikTok', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('đọc access_token ở TOP-LEVEL (TikTok không bọc trong `data`)', async () => {
    mockFetch({
      access_token: 'act_123',
      refresh_token: 'rft_456',
      expires_in: 86400,
      scope: 'user.info.basic',
      token_type: 'Bearer',
    })
    const c = new TikTokConnector()
    const ts = await c.exchangeCode({
      code: 'code123',
      state: 'state123',
      redirectUri: REDIRECT_URI,
      codeVerifier: 'verifier123',
    })
    assert.equal(ts.accessToken, 'act_123')
    assert.equal(ts.refreshToken, 'rft_456')
    assert.deepEqual(ts.scopes, ['user.info.basic'])
    assert.equal(ts.tokenType, 'Bearer')
    // expires_in 86400s → hết hạn khoảng 24h sau
    const diffMs = ts.expiresAt.getTime() - Date.now()
    assert.ok(diffMs > 23 * 3600 * 1000 && diffMs <= 24 * 3600 * 1000)
  })

  it('thiếu access_token → ném lỗi RÕ RÀNG, không để encrypt(undefined) nổ 500 khó hiểu', async () => {
    mockFetch({ error: 'invalid_grant', error_description: 'Code has expired' })
    const c = new TikTokConnector()
    await assert.rejects(
      () =>
        c.exchangeCode({
          code: 'dead_code',
          state: 'state123',
          redirectUri: REDIRECT_URI,
          codeVerifier: 'verifier123',
        }),
      /TikTok từ chối đổi code lấy token: Code has expired/,
    )
  })

  it('HTTP lỗi → TRANSIENT_NETWORK_ERROR (retry được)', async () => {
    mockFetch({}, false)
    const c = new TikTokConnector()
    await assert.rejects(
      () =>
        c.exchangeCode({
          code: 'code123',
          state: 'state123',
          redirectUri: REDIRECT_URI,
          codeVerifier: 'verifier123',
        }),
      /TikTok token exchange failed/,
    )
  })
})
