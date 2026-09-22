import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { requiredEnv, OAuthNotConfiguredError } from './env'

const TOUCHED = [
  'GOOGLE_CLIENT_ID',
  'TEST_OAUTH_REQUIRED_ENV',
]

const saved: Record<string, string | undefined> = {}
for (const k of TOUCHED) saved[k] = process.env[k]

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('requiredEnv', () => {
  it('trả về giá trị khi env đã set (có trim)', () => {
    process.env.TEST_OAUTH_REQUIRED_ENV = '  abc123  '
    assert.equal(requiredEnv('google', 'TEST_OAUTH_REQUIRED_ENV'), 'abc123')
  })

  it('throw OAuthNotConfiguredError khi env thiếu', () => {
    delete process.env.TEST_OAUTH_REQUIRED_ENV
    assert.throws(
      () => requiredEnv('google', 'TEST_OAUTH_REQUIRED_ENV'),
      (e: unknown) => {
        assert.ok(e instanceof OAuthNotConfiguredError)
        assert.equal(e.provider, 'google')
        assert.equal(e.missingVar, 'TEST_OAUTH_REQUIRED_ENV')
        assert.match(e.message, /TEST_OAUTH_REQUIRED_ENV/)
        return true
      },
    )
  })

  it('throw khi env rỗng hoặc chỉ whitespace', () => {
    process.env.TEST_OAUTH_REQUIRED_ENV = '   '
    assert.throws(() => requiredEnv('tiktok', 'TEST_OAUTH_REQUIRED_ENV'), OAuthNotConfiguredError)
  })
})

describe('Instagram connector dùng Instagram Login (không qua Facebook dialog)', () => {
  it('authorizationUrl trỏ về instagram.com/oauth/authorize, không PKCE', async () => {
    process.env.API_URL = 'https://api.example.com'
    process.env.META_APP_ID = 'test-meta-app-id'

    const { InstagramConnector } = await import('./instagram')
    const c = new InstagramConnector()
    const url = c.authorizationUrl({
      workspaceId: 'w1',
      redirectUri: 'https://api.example.com/auth/instagram/callback',
      state: 's',
      codeChallenge: 'c',
    })
    assert.ok(url.startsWith('https://www.instagram.com/oauth/authorize'))
    assert.ok(!url.includes('facebook.com/dialog/oauth'))
    assert.ok(!url.includes('code_challenge'))
    assert.ok(url.includes('instagram_business_basic'))
    assert.ok(url.includes('instagram_business_content_publish'))
    assert.ok(url.includes('client_id=test-meta-app-id'))
    assert.ok(url.includes('response_type=code'))
    delete process.env.API_URL
    delete process.env.META_APP_ID
  })

  it('InstagramConnector.authorizationUrl throw OAuthNotConfiguredError khi thiếu META_APP_ID', async () => {
    process.env.API_URL = 'https://api.example.com'
    delete process.env.META_APP_ID

    const { InstagramConnector } = await import('./instagram')
    const c = new InstagramConnector()
    assert.throws(
      () =>
        c.authorizationUrl({
          workspaceId: 'w1',
          redirectUri: 'https://api.example.com/auth/instagram/callback',
          state: 's',
          codeChallenge: 'c',
        }),
      (e: unknown) => {
        assert.ok(e instanceof OAuthNotConfiguredError)
        assert.equal(e.missingVar, 'META_APP_ID')
        return true
      },
    )
    delete process.env.API_URL
  })
})

describe('connector fail-fast khi thiếu client id', () => {
  it('GoogleConnector.authorizationUrl throw OAuthNotConfiguredError (không còn client_id=undefined)', async () => {
    // ALLOWED_REDIRECT_URIS được build lúc module load → set API_URL trước dynamic import
    process.env.API_URL = 'https://api.example.com'
    delete process.env.GOOGLE_CLIENT_ID

    const { GoogleConnector } = await import('./google')
    const c = new GoogleConnector()
    assert.throws(
      () =>
        c.authorizationUrl({
          workspaceId: 'w1',
          redirectUri: 'https://api.example.com/auth/google/callback',
          state: 's',
          codeChallenge: 'c',
        }),
      (e: unknown) => {
        assert.ok(e instanceof OAuthNotConfiguredError)
        assert.equal(e.missingVar, 'GOOGLE_CLIENT_ID')
        return true
      },
    )
    delete process.env.API_URL
  })

  it('GoogleConnector.authorizationUrl build URL đúng khi đủ env', async () => {
    process.env.API_URL = 'https://api.example.com'
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'

    // module đã được import ở test trước (cache) với API_URL đúng
    const { GoogleConnector } = await import('./google')
    const c = new GoogleConnector()
    const url = c.authorizationUrl({
      workspaceId: 'w1',
      redirectUri: 'https://api.example.com/auth/google/callback',
      state: 's',
      codeChallenge: 'c',
    })
    assert.ok(url.includes('client_id=test-client-id'))
    assert.ok(!url.includes('client_id=undefined'))
    delete process.env.API_URL
  })
})
