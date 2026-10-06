import 'reflect-metadata'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getProviderMeta, publicProviderMeta } from './ai.providers'
import { AI_PROVIDER_IDS } from './dto'
import { VideogenService } from '../videogen/videogen.service'

process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

function mockFetch(handler: (url: string, init?: any) => { status: number; body: string }) {
  const orig = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const { status, body } = handler(String(url), init)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => body,
    } as any
  }) as any
  return () => {
    globalThis.fetch = orig
  }
}

describe('vyceai provider', () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
  })

  it('đăng ký đầy đủ: meta + AI_PROVIDER_IDS + supportsChat', () => {
    const meta = getProviderMeta('vyceai')
    assert.ok(meta, 'có meta')
    assert.equal(meta!.kind, 'openai-compatible')
    assert.equal(meta!.baseUrl, 'https://vyceai.com/v1')
    assert.equal(meta!.imageModel, 'grok-imagine-2')
    assert.ok((AI_PROVIDER_IDS as readonly string[]).includes('vyceai'), 'có trong AI_PROVIDER_IDS')
    const pub = publicProviderMeta().find((p) => p.id === 'vyceai')
    assert.ok(pub, 'có trong public meta')
    assert.equal(pub!.supportsChat, true, 'vyceai có chat model → hiện ở selector chat')
  })

  it('Studio image() với vyceai: gửi aspect_ratio 9:16 + model grok-imagine-2, nhận url ảnh', async () => {
    const meta = getProviderMeta('vyceai')!
    const ai = {
      getChatKey: async () => ({ meta, apiKey: 'v-key', connId: 'c1' }),
    } as any
    const audit = { log: async () => ({}) } as any
    const pollinations = { generateImage: async () => { throw new Error('không dùng') } } as any
    const svc = new VideogenService({} as any, audit, ai, pollinations)

    let seenBody: any = null
    restore = mockFetch((url, init) => {
      assert.ok(url.includes('vyceai.com/v1/images/generations'), 'đúng endpoint ' + url)
      assert.equal(init?.headers?.Authorization, 'Bearer v-key')
      seenBody = JSON.parse(init.body)
      return {
        status: 200,
        body: JSON.stringify({ data: [{ url: 'https://vyceai.com/generated-images/x.jpg' }] }),
      }
    })
    const res = await svc.image('ws1', { prompt: 'a cat', provider: 'vyceai' } as any)
    assert.equal(seenBody.model, 'grok-imagine-2')
    assert.equal(seenBody.aspect_ratio, '9:16', 'grok-imagine-2 dùng aspect_ratio, không phải size')
    assert.ok(!('size' in seenBody), 'không gửi size (vyceai bỏ qua)')
    assert.equal(res.provider, 'vyceai')
    assert.equal(res.model, 'grok-imagine-2')
    assert.equal(res.url, 'https://vyceai.com/generated-images/x.jpg')
    assert.equal(res.mime, 'image/jpeg')
  })
})
