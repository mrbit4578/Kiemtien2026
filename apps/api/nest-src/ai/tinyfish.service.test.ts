import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { TinyFishService } from './tinyfish.service'
import { publicProviderMeta } from './ai.providers'

process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

function makeService(getChatKey: (ws: string, provider: string) => Promise<any>) {
  const ai = { getChatKey } as any
  return new TinyFishService(ai)
}

function mockFetch(handler: (url: string, init?: any) => { status: number; body: string }) {
  const orig = globalThis.fetch
  globalThis.fetch = (async (url: any, init?: any) => {
    const { status, body } = handler(String(url), init)
    return { ok: status >= 200 && status < 300, status, text: async () => body } as any
  }) as any
  return () => {
    globalThis.fetch = orig
  }
}

describe('TinyFishService', () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
  })

  it('search: chuẩn hóa kết quả {title, url, snippet}', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    let seenUrl = ''
    let seenKey = ''
    restore = mockFetch((url, init) => {
      seenUrl = url
      seenKey = init?.headers?.['X-API-Key']
      return {
        status: 200,
        body: JSON.stringify({
          query: 'test',
          results: [
            { position: 1, site_name: 'Example', title: 'Result Title', snippet: 'A snippet…', url: 'https://example.com/page' },
            { position: 2, title: '', url: '' },
          ],
          total_results: 42,
        }),
      }
    })
    const { results, totalResults } = await svc.search('sk-tinyfish-test-key', 'test query')
    assert.ok(seenUrl.startsWith('https://api.search.tinyfish.ai?'))
    assert.ok(seenUrl.includes('query=test+query') || seenUrl.includes('query=test%20query'))
    assert.equal(seenKey, 'sk-tinyfish-test-key')
    assert.equal(results.length, 1) // bản thiếu title/url bị lọc
    assert.equal(results[0].title, 'Result Title')
    assert.equal(results[0].url, 'https://example.com/page')
    assert.equal(results[0].snippet, 'A snippet…')
    assert.equal(totalResults, 42)
  })

  it('search: 401 → báo key bị từ chối, KHÔNG lộ key trong message', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    restore = mockFetch(() => ({ status: 401, body: '{"error":"unauthorized"}' }))
    await assert.rejects(
      () => svc.search('sk-tinyfish-SECRET-KEY-123', 'test'),
      (err: any) => {
        const msg = String(err?.message ?? err)
        assert.ok(msg.includes('Key TinyFish bị từ chối'))
        assert.ok(!msg.includes('sk-tinyfish-SECRET-KEY-123'), 'key lộ trong message!')
        return true
      },
    )
  })

  it('fetchUrls: POST đúng endpoint, trả về text markdown', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    let seenUrl = ''
    let seenBody: any = null
    restore = mockFetch((url, init) => {
      seenUrl = url
      seenBody = JSON.parse(init?.body ?? '{}')
      return {
        status: 200,
        body: JSON.stringify({
          results: [{ url: 'https://example.com', final_url: 'https://example.com/', title: 'Example', text: '# Hello\nNội dung trang' }],
          errors: [],
        }),
      }
    })
    const out = await svc.fetchUrls('k', ['https://example.com'])
    assert.equal(seenUrl, 'https://api.fetch.tinyfish.ai')
    assert.deepEqual(seenBody.urls, ['https://example.com'])
    assert.equal(seenBody.format, 'markdown')
    assert.equal(out.length, 1)
    assert.ok(out[0].text.includes('Nội dung trang'))
  })

  it('getApiKey: trả key khi đã kết nối, null khi chưa', async () => {
    const okSvc = makeService(async () => ({ apiKey: 'k-123', meta: { id: 'tinyfish' }, connId: 'c1' }))
    assert.equal(await okSvc.getApiKey('ws1'), 'k-123')
    const noSvc = makeService(async () => {
      throw new Error('chưa kết nối')
    })
    assert.equal(await noSvc.getApiKey('ws1'), null)
  })

  it('runAgent: POST đúng endpoint /run, parse result object', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    let seenUrl = ''
    let seenBody: any = null
    let seenKey = ''
    restore = mockFetch((url, init) => {
      seenUrl = url
      seenBody = JSON.parse(init?.body ?? '{}')
      seenKey = init?.headers?.['X-API-Key']
      return {
        status: 200,
        body: JSON.stringify({
          result: { title: 'Sản phẩm A', price: '100k' },
          status: 'COMPLETED',
        }),
      }
    })
    const out = await svc.runAgent('k-test', 'https://example.com/shop', 'Trích 5 sản phẩm bán chạy')
    assert.equal(seenUrl, 'https://agent.tinyfish.ai/v1/automation/run')
    assert.equal(seenKey, 'k-test')
    assert.equal(seenBody.url, 'https://example.com/shop')
    assert.equal(seenBody.goal, 'Trích 5 sản phẩm bán chạy')
    assert.ok(seenBody.agent_config.max_steps >= 1)
    assert.ok(out.includes('Sản phẩm A'))
    assert.ok(out.includes('100k'))
  })

  it('runAgent: result dạng text trong result.result', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    restore = mockFetch(() => ({
      status: 200,
      body: JSON.stringify({ result: { result: 'Đây là tóm tắt trang.' } }),
    }))
    const out = await svc.runAgent('k', 'https://example.com', 'Tóm tắt trang')
    assert.equal(out, 'Đây là tóm tắt trang.')
  })

  it('runAgent: URL không hợp lệ → 400, không gọi API', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    let called = false
    restore = mockFetch(() => {
      called = true
      return { status: 200, body: '{}' }
    })
    await assert.rejects(() => svc.runAgent('k', 'ftp://example.com', 'goal hợp lệ'), /http\(s\)/)
    assert.equal(called, false)
  })

  it('runAgent: 402 hết tiền ví → message rõ, không lộ key', async () => {
    const svc = makeService(async () => {
      throw new Error('not used')
    })
    restore = mockFetch(() => ({ status: 402, body: '{"error":"insufficient funds"}' }))
    await assert.rejects(
      () => svc.runAgent('sk-tinyfish-SECRET', 'https://example.com', 'goal'),
      (err: any) => {
        const msg = String(err?.message ?? err)
        assert.ok(!msg.includes('sk-tinyfish-SECRET'), 'key lộ trong message!')
        return true
      },
    )
  })
})

describe('tinyfish trong publicProviderMeta', () => {
  it('có entry tinyfish với supportsChat: false', () => {
    const metas = publicProviderMeta() as Array<Record<string, unknown>>
    const tf = metas.find((m) => m['id'] === 'tinyfish')
    assert.ok(tf, 'thiếu provider tinyfish')
    assert.equal(tf['supportsChat'], false)
    assert.deepEqual(tf['models'], [])
  })

  it('provider chat khác vẫn supportsChat: true', () => {
    const metas = publicProviderMeta() as Array<Record<string, unknown>>
    const gemini = metas.find((m) => m['id'] === 'gemini')
    assert.equal(gemini?.['supportsChat'], true)
  })
})
