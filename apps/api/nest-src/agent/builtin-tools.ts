/**
 * Built-in tools cho AI agent.
 *
 * KHÁC BIỆT CỐ Ý so với Strix: không port shell/browser/proxy tùy ý vì Render
 * không có Docker sandbox. Mọi tool ở đây đều là allowlist, có timeout, có trần
 * output và validate args — chạy an toàn trong process API.
 */
import { assertSafeUrl, SsrfBlockedError } from './ssrf'
import type { ToolDefinition } from './tool-registry'

const TOOL_FETCH_TIMEOUT_MS = 15_000
const MAX_FETCH_BYTES = 1_000_000 // 1 MiB — giống cap ở viewer của Strix

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Bóc text thô từ HTML: bỏ script/style, strip tags, gộp whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tìm kiếm web qua DuckDuckGo HTML (không cần API key) — cùng pattern với RagService. */
export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Tìm kiếm thông tin mới trên web (tin tức, giá cả, tài liệu). Dùng khi câu hỏi cần kiến thức cập nhật sau thời điểm training của model.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Câu truy vấn tìm kiếm',
        minLength: 2,
        maxLength: 300,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const query = args['query'] as string
    try {
      const res = await fetchTimeout(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenRemoteHub/1.0)' } },
        TOOL_FETCH_TIMEOUT_MS,
      )
      if (!res.ok) return 'Tìm kiếm web thất bại, hãy trả lời bằng kiến thức có sẵn.'
      const html = await res.text()
      const out: string[] = []
      const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(html)) && out.length < 5) {
        const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        if (title) out.push(`- ${title} (${m[1]})`)
      }
      return out.length > 0 ? out.join('\n') : 'Không tìm thấy kết quả phù hợp.'
    } catch {
      return 'Tìm kiếm web thất bại (lỗi mạng), hãy trả lời bằng kiến thức có sẵn.'
    }
  },
}

/** Đọc nội dung text của một URL — có SSRF guard fail-closed. */
export const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description:
    'Đọc nội dung text của một trang web công khai (bài viết, tài liệu). Chỉ dùng cho URL công khai, không dùng cho URL nội bộ.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL http/https công khai cần đọc',
        minLength: 10,
        maxLength: 2000,
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const rawUrl = args['url'] as string
    let url: URL
    try {
      url = await assertSafeUrl(rawUrl)
    } catch (err) {
      if (err instanceof SsrfBlockedError) return err.message
      return `URL không hợp lệ: ${rawUrl}`
    }
    try {
      const res = await fetchTimeout(
        url.toString(),
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenRemoteHub/1.0)' },
          redirect: 'manual', // không follow redirect — redirect có thể trỏ vào nội bộ
        },
        TOOL_FETCH_TIMEOUT_MS,
      )
      if (res.status >= 300 && res.status < 400) {
        return 'Trang yêu cầu chuyển hướng — tool không follow redirect vì lý do bảo mật.'
      }
      if (!res.ok) return `Không đọc được trang (HTTP ${res.status}).`
      const contentType = res.headers.get('content-type') ?? ''
      if (!/text|html|json|xml/i.test(contentType)) {
        return `Không đọc được: content-type "${contentType}" không phải text.`
      }
      const reader = res.body?.getReader()
      if (!reader) return 'Không đọc được nội dung trang.'
      const chunks: Uint8Array[] = []
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > MAX_FETCH_BYTES) {
          await reader.cancel().catch(() => {})
          break
        }
        chunks.push(value)
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0)
      const buf = new Uint8Array(total)
      let offset = 0
      for (const c of chunks) {
        buf.set(c, offset)
        offset += c.byteLength
      }
      const html = new TextDecoder('utf-8', { fatal: false }).decode(buf)
      const text = htmlToText(html)
      if (!text) return 'Trang không có nội dung text đọc được.'
      return received > MAX_FETCH_BYTES ? text + '\n…[đã cắt ở 1 MiB]' : text
    } catch {
      return 'Không đọc được trang (lỗi mạng/timeout).'
    }
  },
}

/** Giờ hiện tại (múi giờ Việt Nam). */
export const currentTimeTool: ToolDefinition = {
  name: 'get_current_time',
  description: 'Lấy ngày giờ hiện tại (múi giờ Asia/Ho_Chi_Minh). Dùng khi câu hỏi liên quan đến thời gian.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => {
    const now = new Date()
    const fmt = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${fmt.format(now)} (giờ Việt Nam, ISO: ${now.toISOString()})`
  },
}

/** Tool tìm trong kho tri thức của workspace — inject hàm search từ RagService. */
export function makeKnowledgeSearchTool(
  search: (query: string, topK: number) => Promise<Array<{ title: string; content: string; score: number }>>,
): ToolDefinition {
  return {
    name: 'knowledge_search',
    description:
      'Tìm kiếm trong kho tri thức (tài liệu đã upload) của workspace. Dùng khi câu hỏi liên quan đến tài liệu, ghi chú nội bộ của người dùng.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Câu truy vấn tìm trong kho tri thức',
          minLength: 2,
          maxLength: 500,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const query = args['query'] as string
      try {
        const chunks = await search(query, 5)
        if (chunks.length === 0) return 'Kho tri thức không có tài liệu nào phù hợp.'
        return chunks
          .map(
            (c, i) =>
              `[${i + 1}] ${c.title} (độ phù hợp ${c.score.toFixed(2)}):\n${c.content.slice(0, 1200)}`,
          )
          .join('\n\n')
      } catch {
        return 'Không truy vấn được kho tri thức lúc này.'
      }
    },
  }
}

/** Tool liệt kê các AI provider workspace đã kết nối — inject từ AiService. */
export function makeListConnectedAiTool(
  list: () => Promise<Array<{ provider: string; status: string }>>,
): ToolDefinition {
  return {
    name: 'list_connected_ai',
    description:
      'Liệt kê các nền tảng AI (Gemini, ChatGPT, Grok, Claude, DeepSeek) mà workspace đã kết nối key. Dùng khi người dùng hỏi về key/AI đã kết nối.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => {
      try {
        const conns = await list()
        const active = conns.filter((c) => c.status === 'active')
        if (active.length === 0) return 'Workspace chưa kết nối AI provider nào.'
        return `Đã kết nối: ${active.map((c) => c.provider).join(', ')}.`
      } catch {
        return 'Không lấy được danh sách AI đã kết nối lúc này.'
      }
    },
  }
}

/** Toàn bộ built-in tools (knowledge_search và list_connected_ai cần inject sau). */
export function buildBuiltinTools(deps: {
  knowledgeSearch: (query: string, topK: number) => Promise<Array<{ title: string; content: string; score: number }>>
  listConnectedAi: () => Promise<Array<{ provider: string; status: string }>>
}): ToolDefinition[] {
  return [
    webSearchTool,
    fetchUrlTool,
    currentTimeTool,
    makeKnowledgeSearchTool(deps.knowledgeSearch),
    makeListConnectedAiTool(deps.listConnectedAi),
  ]
}
