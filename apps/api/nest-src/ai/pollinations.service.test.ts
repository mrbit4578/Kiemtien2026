import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { HttpException } from '@nestjs/common'
import { PollinationsService } from './pollinations.service'
import { publicProviderMeta, getProviderMeta } from './ai.providers'

process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

function makeService(getChatKey: (ws: string, provider: string) => Promise<any>) {
  const ai = { getChatKey } as any
  return new PollinationsService(ai)
}

function mockFetch(
  handler: (url: string, init?: any) => { status: number; body: Buffer | string; contentType?: string },
) {
  const orig = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const { status, body, contentType } = handler(String(url), init)
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? (contentType ?? null) : null) },
      arrayBuffer: async () => buf,
      text: async () => buf.toString('utf8'),
    } as any
  }) as any
  return () => {
    globalThis.fetch = orig
  }
}

describe('PollinationsService', () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
  })

  it('generateImage: dựng đúng URL + header Bearer, trả về buffer/mime', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    let seenUrl = ''
    let seenAuth = ''
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
    restore = mockFetch((url, init) => {
      seenUrl = url
      seenAuth = init?.headers?.Authorization ?? ''
      return { status: 200, body: png, contentType: 'image/png' }
    })
    const out = await svc.generateImage('KEY-123', 'a cat astronaut', { width: 768, height: 1344 })
    assert.match(seenUrl, /^https:\/\/gen\.pollinations\.ai\/image\//)
    assert.ok(seenUrl.includes('model=flux'), 'model=flux')
    assert.ok(seenUrl.includes('width=768') && seenUrl.includes('height=1344'), 'kích thước 9:16')
    assert.ok(seenUrl.includes('nologo=true'), 'nologo=true')
    assert.equal(seenAuth, 'Bearer KEY-123')
    assert.deepEqual(out.buffer, png)
    assert.equal(out.mime, 'image/png')
    assert.equal(out.model, 'flux')
  })

  it('generateImage: 401 → báo key bị từ chối, che key trong message', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    restore = mockFetch(() => ({ status: 401, body: 'KEY-123 unauthorized', contentType: 'text/plain' }))
    await assert.rejects(() => svc.generateImage('KEY-123', 'prompt'), (err: any) => {
      assert.ok(err instanceof HttpException)
      assert.match(err.message, /bị từ chối/)
      assert.ok(!err.message.includes('KEY-123'), 'key phải được che')
      return true
    })
  })

  it('generateImage: 429 → message giữ "429" để chain fallback nhận ra', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    restore = mockFetch(() => ({ status: 429, body: 'rate limited', contentType: 'text/plain' }))
    await assert.rejects(() => svc.generateImage('k', 'prompt'), (err: any) => {
      assert.ok(/429|rate.?limit|quota/i.test(err.message), 'is429ish phải bắt được')
      return true
    })
  })

  it('generateImage: body không phải ảnh → báo lỗi rõ', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    restore = mockFetch(() => ({ status: 200, body: '{"error":"busy"}', contentType: 'application/json' }))
    await assert.rejects(() => svc.generateImage('k', 'prompt'), /không trả về ảnh hợp lệ/)
  })

  it('generateImage: prompt trống → 400', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    await assert.rejects(() => svc.generateImage('k', '   '), /Prompt tạo ảnh trống/)
  })

  it('getApiKey: trả key khi đã kết nối, null khi chưa', async () => {
    const okSvc = makeService(async () => ({ apiKey: 'K', meta: {}, connId: 'c1' }))
    assert.equal(await okSvc.getApiKey('ws1'), 'K')
    const noSvc = makeService(async () => {
      throw new Error('not connected')
    })
    assert.equal(await noSvc.getApiKey('ws1'), null)
  })
})

describe('pollinations provider meta', () => {
  it('đăng ký trong SUPPORTED_PROVIDERS, supportsChat=false', () => {
    const meta = getProviderMeta('pollinations')
    assert.ok(meta, 'có meta')
    assert.equal(meta!.keyUrl, 'https://enter.pollinations.ai')
    const pub = publicProviderMeta().find((p) => p.id === 'pollinations')
    assert.ok(pub, 'có trong public meta')
    assert.equal(pub!.supportsChat, false)
    assert.match(pub!.description, /miễn phí/i)
  })
})
