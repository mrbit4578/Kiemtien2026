import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { HttpException } from '@nestjs/common'
import { VideogenService } from './videogen.service'

process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

const geminiMeta = { id: 'gemini', name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://gen.test' }
const openaiMeta = { id: 'openai', name: 'ChatGPT (OpenAI)', kind: 'openai-compatible', baseUrl: 'https://oai.test' }
const pollMeta = { id: 'pollinations', name: 'Pollinations.ai', kind: 'pollinations', baseUrl: 'https://gen.pollinations.ai' }

function makeService(
  keys: Record<string, { meta: any; apiKey: string }>,
  pollinationsImpl?: (apiKey: string, prompt: string, opts?: any) => Promise<{ buffer: Buffer; mime: string; model: string }>,
) {
  const ai = {
    getChatKey: async (_ws: string, id: string) => {
      const k = keys[id]
      if (!k) throw Object.assign(new Error('chưa kết nối'), { status: 404 })
      return k
    },
  } as any
  const audit = { log: async () => ({}) } as any
  const pollinations = {
    generateImage: pollinationsImpl ?? (async () => { throw new Error('pollinations mock chưa cấu hình') }),
  } as any
  return new VideogenService({} as any, audit, ai, pollinations)
}

const QUOTA_429_BODY = JSON.stringify({
  error: {
    code: 429,
    message:
      'You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0',
  },
})

function mockFetch(handler: (url: string, init?: any) => { status: number; body: string }) {
  const orig = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const { status, body } = handler(String(url), init)
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as any
  }) as any
  return () => {
    globalThis.fetch = orig
  }
}

describe('videogen image() fallback (chuỗi Pollinations → Gemini → OpenAI)', () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
  })

  it('auto: Pollinations 429 → tự thử Gemini (đúng nhãn UI "Tự động (Pollinations → Gemini → OpenAI)")', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const svc = makeService(
      {
        pollinations: { meta: pollMeta, apiKey: 'p-key' },
        gemini: { meta: geminiMeta, apiKey: 'g-key' },
      },
      async () => {
        throw new HttpException('Pollinations báo 429 (hết quota/giới hạn tạm thời).', 502)
      },
    )
    restore = mockFetch((url) => {
      if (url.includes('generateContent'))
        return {
          status: 200,
          body: JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }] } }],
          }),
        }
      return { status: 500, body: 'unexpected: ' + url }
    })
    const res = await svc.image('ws1', { prompt: 'a cat', provider: undefined } as any)
    assert.equal(res.provider, 'gemini')
  })

  it('user chọn Gemini cụ thể, Gemini 429 → bỏ qua Pollinations chưa kết nối, fallback OpenAI', async () => {
    const svc = makeService({
      gemini: { meta: geminiMeta, apiKey: 'g-key' },
      openai: { meta: openaiMeta, apiKey: 'o-key' },
    })
    restore = mockFetch((url) => {
      if (url.includes('generateContent')) return { status: 429, body: QUOTA_429_BODY }
      if (url.includes('/images/generations'))
        return { status: 200, body: JSON.stringify({ data: [{ b64_json: 'BBBB' }] }) }
      return { status: 500, body: 'unexpected' }
    })
    const res = await svc.image('ws1', { prompt: 'a cat', provider: 'gemini' } as any)
    assert.equal(res.provider, 'openai')
  })

  it('tất cả đều 429 → báo rõ đã thử provider nào (kể cả Pollinations)', async () => {
    const svc = makeService(
      {
        pollinations: { meta: pollMeta, apiKey: 'p-key' },
        gemini: { meta: geminiMeta, apiKey: 'g-key' },
      },
      async () => {
        throw new HttpException('Pollinations báo 429 (hết quota/giới hạn tạm thời).', 502)
      },
    )
    restore = mockFetch(() => ({ status: 429, body: QUOTA_429_BODY }))
    await assert.rejects(
      () => svc.image('ws1', { prompt: 'a cat' } as any),
      /Đã thử: Pollinations\.ai \(hết quota\); Google Gemini \(hết quota\); openai \(chưa kết nối\)/,
    )
  })

  it('không có key nào → báo vào AI Pro kết nối key', async () => {
    const svc = makeService({})
    restore = mockFetch(() => ({ status: 200, body: '{}' }))
    await assert.rejects(
      () => svc.image('ws1', { prompt: 'a cat' } as any),
      /Cài đặt → AI Pro/,
    )
  })

  it('lỗi không phải 429 (VD 400) → throw ngay, không fallback vô ích', async () => {
    const svc = makeService({
      gemini: { meta: geminiMeta, apiKey: 'g-key' },
      openai: { meta: openaiMeta, apiKey: 'o-key' },
    })
    let openaiHit = false
    restore = mockFetch((url) => {
      if (url.includes('generateContent')) return { status: 400, body: '{"error":{"message":"bad request"}}' }
      if (url.includes('/images/generations')) {
        openaiHit = true
        return { status: 200, body: JSON.stringify({ data: [{ b64_json: 'X' }] }) }
      }
      return { status: 500, body: 'unexpected' }
    })
    await assert.rejects(() => svc.image('ws1', { prompt: 'a cat' } as any), /trả lỗi 400/)
    assert.equal(openaiHit, false)
  })
})
