import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWebSearchTool, makeFetchUrlTool, buildBuiltinTools } from './builtin-tools'

describe('web_search/fetch_url với TinyFish backend', () => {
  it('web_search ưu tiên kết quả TinyFish khi có key', async () => {
    const tool = makeWebSearchTool({
      search: async (q) => [
        { title: 'Tin mới nhất', url: 'https://news.example/a', snippet: 'Tóm tắt tin nóng' },
        { title: 'Tin thứ hai', url: 'https://news.example/b', snippet: '' },
      ],
      fetchUrl: async () => null,
    })
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
      search: async () => {
        throw new Error('429 quota')
      },
      fetchUrl: async () => null,
    })
    const out = (await tool.execute({ query: 'test query fallback' }, {} as any)) as string
    assert.equal(typeof out, 'string')
    assert.ok(out.length > 0)
  })

  it('fetch_url ưu tiên markdown từ TinyFish khi có key', async () => {
    const tool = makeFetchUrlTool({
      search: async () => null,
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

  it('buildBuiltinTools: có tinyfish → tool web_search/fetch_url vẫn đăng ký đúng tên', () => {
    const tools = buildBuiltinTools({
      knowledgeSearch: async () => [],
      listConnectedAi: async () => [],
      tinyfish: { search: async () => null, fetchUrl: async () => null },
    })
    const names = tools.map((t) => t.name)
    assert.ok(names.includes('web_search'))
    assert.ok(names.includes('fetch_url'))
  })
})
