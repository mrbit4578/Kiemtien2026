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

describe('TikTokConnector.authorizationUrl — scope mặc định', () => {
  it('xin user.info.basic + video.publish (Content Posting API đã bật cho app)', () => {
    const c = new TikTokConnector()
    const url = new URL(
      c.authorizationUrl({
        redirectUri: REDIRECT_URI,
        codeChallenge: 'challenge123',
        state: 'state123',
      }),
    )
    assert.equal(url.searchParams.get('client_key'), 'test_client_key')
    // TikTok BẮT BUỘC scope phân cách bằng dấu phẩy (không phải dấu cách).
    assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.publish')
    assert.equal(url.searchParams.get('redirect_uri'), REDIRECT_URI)
  })
})

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

describe('TikTokConnector.publish — Direct Post (init → chunk PUT → status)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const require2 = createRequire(__filename)
  const { encrypt } = require2('@orh/crypto')
  const { OrhError } = require2('@orh/shared')

  function testConnection() {
    process.env.TOKEN_ENCRYPTION_KEY =
      'test_key_dai_hon_32_ky_tu_cho_unit_test_1234567890'
    return { encryptedAccessToken: encrypt('tiktok_test_token') }
  }

  function mockSequence(specs: Array<{ ok?: boolean; json?: unknown; arrayBuffer?: ArrayBuffer; headers?: Record<string, string> }>, onCall?: (index: number, url: unknown, init: unknown) => void) {
    let i = 0
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      const idx = i
      const spec = specs[Math.min(i++, specs.length - 1)]
      onCall?.(idx, url, init)
      return {
        ok: spec.ok ?? true,
        status: (spec.ok ?? true) ? 200 : 400,
        headers: { get: (k: string) => spec.headers?.[k.toLowerCase()] ?? null },
        json: async () => spec.json ?? {},
        arrayBuffer: async () => spec.arrayBuffer ?? new ArrayBuffer(0),
      } as unknown as Response
    }) as typeof fetch
  }

  const VIDEO_URL = 'https://res.cloudinary.com/demo/video/upload/v1/abc.mp4'

  it('không có video → CONTENT_REJECTED, message rõ ràng', async () => {
    const c = new TikTokConnector()
    const err = await c
      .publish({
        connection: testConnection(),
        caption: 'caption',
        mediaUrls: ['https://example.com/a.jpg'],
        mediaKinds: ['image'],
      } as never)
      .catch((e: unknown) => e)
    assert.ok(err instanceof OrhError)
    assert.equal((err as { code: string }).code, 'CONTENT_REJECTED')
    assert.match((err as Error).message, /chỉ đăng được video/)
  })

  it('full flow: download → init → PUT chunk (Content-Range đúng) → status PUBLISH_COMPLETE → status private', async () => {
    const seen: Array<{ url: unknown; init: any }> = []
    const videoBytes = new TextEncoder().encode('fake-mp4-bytes').buffer
    mockSequence(
      [
        { headers: { 'content-length': '14' }, arrayBuffer: videoBytes },
        {
          json: {
            error: { code: 'ok', message: '', log_id: 'log1' },
            data: { publish_id: 'pub_123', upload_url: 'https://upload.example/put?x=1' },
          },
        },
        { json: {} },
        {
          json: { error: { code: 'ok', message: '', log_id: 'log2' }, data: { status: 'PUBLISH_COMPLETE' } },
        },
      ],
      (i, url, init) => seen.push({ url, init }),
    )
    const c = new TikTokConnector()
    const res = await c.publish({
      connection: testConnection(),
      caption: 'hello #tiktok',
      mediaUrls: [VIDEO_URL],
      mediaKinds: ['video'],
    } as never)
    assert.equal(res.platformPostId, 'pub_123')
    assert.equal(res.status, 'private')
    assert.match(res.warning ?? '', /Riêng tư/)
    // init gọi đúng endpoint TikTok
    assert.match(String(seen[1].url), /open\.tiktokapis\.com\/v2\/post\/publish\/video\/init\//)
    const initBody = JSON.parse(seen[1].init.body)
    assert.equal(initBody.post_info.privacy_level, 'SELF_ONLY')
    assert.equal(initBody.source_info.source, 'FILE_UPLOAD')
    assert.equal(initBody.source_info.video_size, 14)
    // chunk PUT: đúng upload_url + Content-Range bytes 0-13/14
    assert.equal(seen[2].url, 'https://upload.example/put?x=1')
    assert.equal(seen[2].init.method, 'PUT')
    assert.equal(seen[2].init.headers['Content-Range'], 'bytes 0-13/14')
  })

  it('TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE → init dùng public, status published (dùng sau khi app được duyệt)', async () => {
    const seen: Array<{ url: unknown; init: any }> = []
    const videoBytes = new TextEncoder().encode('fake-mp4-bytes').buffer
    process.env.TIKTOK_PRIVACY_LEVEL = 'PUBLIC_TO_EVERYONE'
    try {
      mockSequence(
        [
          { headers: { 'content-length': '14' }, arrayBuffer: videoBytes },
          {
            json: {
              error: { code: 'ok', message: '', log_id: 'log1' },
              data: { publish_id: 'pub_pub', upload_url: 'https://upload.example/put?x=1' },
            },
          },
          { json: {} },
          {
            json: { error: { code: 'ok', message: '', log_id: 'log2' }, data: { status: 'PUBLISH_COMPLETE' } },
          },
        ],
        (i, url, init) => seen.push({ url, init }),
      )
      const c = new TikTokConnector()
      const res = await c.publish({
        connection: testConnection(),
        caption: 'public video',
        mediaUrls: [VIDEO_URL],
        mediaKinds: ['video'],
      } as never)
      const initBody = JSON.parse(seen[1].init.body)
      assert.equal(initBody.post_info.privacy_level, 'PUBLIC_TO_EVERYONE')
      assert.equal(res.status, 'published')
      assert.match(res.warning ?? '', /công khai/)
    } finally {
      delete process.env.TIKTOK_PRIVACY_LEVEL
    }
  })

  it('init trả scope_not_authorized → PROVIDER_REAUTH_REQUIRED, hướng dẫn Kết nối lại', async () => {
    mockSequence([
      { headers: { 'content-length': '14' }, arrayBuffer: new TextEncoder().encode('x'.repeat(14)).buffer },
      { json: { error: { code: 'scope_not_authorized', message: 'scope not authorized', log_id: 'l' } } },
    ])
    const c = new TikTokConnector()
    const err = await c
      .publish({
        connection: testConnection(),
        caption: 'c',
        mediaUrls: [VIDEO_URL],
        mediaKinds: ['video'],
      } as never)
      .catch((e: unknown) => e)
    assert.ok(err instanceof OrhError)
    assert.equal((err as { code: string }).code, 'PROVIDER_REAUTH_REQUIRED')
    assert.match((err as Error).message, /Kết nối lại/)
  })

  it('init trả unaudited_client_can_only_post_to_private_accounts → PROVIDER_REVIEW_REQUIRED', async () => {
    mockSequence([
      { headers: { 'content-length': '14' }, arrayBuffer: new TextEncoder().encode('x'.repeat(14)).buffer },
      {
        json: {
          error: {
            code: 'unaudited_client_can_only_post_to_private_accounts',
            message: 'private only',
            log_id: 'l',
          },
        },
      },
    ])
    const c = new TikTokConnector()
    const err = await c
      .publish({
        connection: testConnection(),
        caption: 'c',
        mediaUrls: [VIDEO_URL],
        mediaKinds: ['video'],
      } as never)
      .catch((e: unknown) => e)
    assert.ok(err instanceof OrhError)
    assert.equal((err as { code: string }).code, 'PROVIDER_REVIEW_REQUIRED')
    assert.match((err as Error).message, /Riêng tư/)
  })
})

describe('planTiktokChunks — total_chunk_count = FLOOR, chunk cuối nuốt phần dư', () => {
  const { planTiktokChunks } = createRequire(__filename)('./tiktok')
  const MB = 1024 * 1024

  it('file nhỏ (<= 64MB) → 1 chunk duy nhất, chunk_size = cả file', () => {
    assert.deepEqual(planTiktokChunks(3 * MB), { chunkSize: 3 * MB, chunkCount: 1 })
    assert.deepEqual(planTiktokChunks(64 * MB), { chunkSize: 64 * MB, chunkCount: 1 })
  })

  it('file 82.7MB (case thực tế từng fail) → 8 chunk (floor), chunk cuối ~12.7MB >= 5MB', () => {
    const size = Math.round(82.7 * MB)
    const { chunkSize, chunkCount } = planTiktokChunks(size)
    assert.equal(chunkSize, 10 * MB)
    assert.equal(chunkCount, 8) // ceil cũ cho 9 chunk, chunk cuối ~2.7MB < 5MB → TikTok từ chối
    const lastChunk = size - (chunkCount - 1) * chunkSize
    assert.ok(lastChunk >= 5 * MB, `chunk cuối ${lastChunk} phải >= 5MB`)
    assert.ok(lastChunk >= chunkSize && lastChunk < 2 * chunkSize)
  })

  it('quét 65–100MB: chunk cuối luôn trong [chunkSize, 2*chunkSize), không bao giờ < 5MB', () => {
    for (let mb = 65; mb <= 100; mb++) {
      const size = mb * MB
      const { chunkSize, chunkCount } = planTiktokChunks(size)
      assert.equal(chunkCount, Math.floor(size / chunkSize))
      const lastChunk = size - (chunkCount - 1) * chunkSize
      assert.ok(lastChunk >= 5 * MB, `${mb}MB: chunk cuối ${lastChunk} < 5MB`)
      // Tổng các chunk khớp đúng video_size (không thừa/thiếu byte)
      assert.equal((chunkCount - 1) * chunkSize + lastChunk, size)
    }
  })
})
