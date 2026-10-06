import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  makeWebSearchTool,
  makeFetchUrlTool,
  makeWebAgentTool,
  buildBuiltinTools,
  type TinyFishWebBackend,
} from './builtin-tools'

const fakeBackend: TinyFishWebBackend = {
  search: async (q) => [
    { title: 'Tin mới nhất', url: 'https://news.example/a', snippet: 'Tóm tắt tin nóng' },
    { title: 'Tin thứ hai', url: 'https://news.example/b', snippet: '' },
  ],
  fetchUrl: async () => null,
  runAgent: async (url, goal) => `Kết quả agent cho ${url}: ${goal}`,
}

describe('web_search/fetch_url với TinyFish backend', () => {
  it('web_search ưu tiên kết quả TinyFish khi có key', async () => {
    const tool = makeWebSearchTool(fakeBackend)
    const out = (await tool.execute({ query: 'fifa world cup' }, {} as any)) as string
    assert.ok(out.includes('Tin mới nhất'))
    assert.ok(out.includes('https://news.example/a'))
    assert.ok(out.includes('Tóm tắt tin nóng'))
    assert.ok(out.includes('Tin thứ hai'))
  })

  it('web_search: TinyFish lỗi → không crash (rớt xuống DuckDuckGo)', async () => {
    // Backend ném lỗi (VD: hết quota) → tool phải tự fallback, không ném ra ngoài.
    // Không assert nội dung DuckDuckGo (phụ thuộc mạng), chỉ assert không throw
    // và trả về string.
    const tool = makeWebSearchTool({
      ...fakeBackend,
      search: async () => {
        throw new Error('429 quota')
      },
    })
    const out = (await tool.execute({ query: 'test query fallback' }, {} as any)) as string
    assert.equal(typeof out, 'string')
    assert.ok(out.length > 0)
  })

  it('fetch_url ưu tiên markdown từ TinyFish khi có key', async () => {
    const tool = makeFetchUrlTool({
      ...fakeBackend,
      fetchUrl: async (url) => `# Tiêu đề\n\nNội dung từ ${url}`,
    })
    const out = (await tool.execute({ url: 'https://example.com/bai-viet' }, {} as any)) as string
    assert.ok(out.includes('Tiêu đề'))
    assert.ok(out.includes('https://example.com/bai-viet'))
  })

  it('buildBuiltinTools: không truyền tinyfish vẫn đủ 5 tool như cũ', () => {
    const tools = buildBuiltinTools({
      knowledgeSearch: async () => [],
      listConnectedAi: async () => [],
    })
    const names = tools.map((t) => t.name).sort()
    assert.deepEqual(names, [
      'fetch_url',
      'get_current_time',
      'knowledge_search',
      'list_connected_ai',
      'web_search',
    ])
  })

  it('buildBuiltinTools: có tinyfish → thêm web_agent', () => {
    const tools = buildBuiltinTools({
      knowledgeSearch: async () => [],
      listConnectedAi: async () => [],
      tinyfish: fakeBackend,
    })
    const names = tools.map((t) => t.name)
    assert.ok(names.includes('web_search'))
    assert.ok(names.includes('fetch_url'))
    assert.ok(names.includes('web_agent'))
  })
})

describe('web_agent (TinyFish, metered)', () => {
  it('không có backend → không đăng ký tool (tránh gọi nhầm tốn tiền)', () => {
    assert.equal(makeWebAgentTool(null), null)
    assert.equal(makeWebAgentTool(undefined), null)
  })

  it('có backend → tool đăng ký với cảnh báo chi phí trong description', () => {
    const tool = makeWebAgentTool(fakeBackend)
    assert.ok(tool)
    assert.equal(tool!.name, 'web_agent')
    assert.ok(tool!.description.includes('TRỪ TIỀN'))
  })

  it('execute: gọi backend và trả kết quả', async () => {
    const tool = makeWebAgentTool(fakeBackend)!
    const out = (await tool.execute(
      { url: 'https://example.com', goal: 'Trích tiêu đề trang' },
      {} as any,
    )) as string
    assert.ok(out.includes('https://example.com'))
    assert.ok(out.includes('Trích tiêu đề trang'))
  })

  it('execute: URL không hợp lệ → báo ngay, không gọi API', async () => {
    let called = false
    const tool = makeWebAgentTool({
      ...fakeBackend,
      runAgent: async () => {
        called = true
        return 'x'
      },
    })!
    const out = (await tool.execute({ url: 'ftp://example.com', goal: 'mục tiêu hợp lệ 123' }, {} as any)) as string
    assert.ok(out.includes('URL không hợp lệ'))
    assert.equal(called, false)
  })

  it('execute: backend lỗi → trả message thân thiện, không throw', async () => {
    const tool = makeWebAgentTool({
      ...fakeBackend,
      runAgent: async () => {
        throw new Error('HTTP 402 hết tiền ví')
      },
    })!
    const out = (await tool.execute({ url: 'https://example.com', goal: 'mục tiêu hợp lệ 123' }, {} as any)) as string
    assert.ok(out.includes('Web agent thất bại'))
  })
})
