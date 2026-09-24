/**
 * Built-in tools cho AI agent.
 *
 * KHÁC BIỆT CỐ Ý so với Strix: không port shell/browser/proxy tùy ý vì Render
 * không có Docker sandbox. Mọi tool ở đây đều là allowlist, có timeout, có trần
 * output và validate args — chạy an toàn trong process API.
 */
import {
  fetchTimeout,
  fetchPinnedWithRedirects,
  SsrfBlockedError,
  redactUrlSecrets,
} from '../common/safe-fetch'
import type { ToolDefinition } from './tool-registry'

const TOOL_FETCH_TIMEOUT_MS = 15_000
const MAX_FETCH_BYTES = 1_000_000 // 1 MiB — giống cap ở viewer của Strix

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
    try {
      // Transport pinned: DNS pinning + mỗi hop redirect đều re-validate.
      const res = await fetchPinnedWithRedirects(rawUrl, {
        timeoutMs: TOOL_FETCH_TIMEOUT_MS,
        maxBytes: MAX_FETCH_BYTES,
      })
      if (res.status < 200 || res.status >= 300) {
        return `Không đọc được trang (HTTP ${res.status}).`
      }
      if (!/text|html|json|xml/i.test(res.contentType)) {
        return `Không đọc được: content-type "${res.contentType}" không phải text.`
      }
      const text = htmlToText(res.text)
      if (!text) return 'Trang không có nội dung text đọc được.'
      return res.truncated ? text + '\n…[đã cắt ở 1 MiB]' : text
    } catch (err) {
      if (err instanceof SsrfBlockedError) return err.message
      return `Không đọc được trang (lỗi mạng/timeout): ${redactUrlSecrets(rawUrl)}`
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

/** Tool render video bằng Concat engine headless — inject từ RenderService. */
export function makeRenderVideoTool(
  render: (spec: {
    name: string
    clips: Array<{ source: string; start?: number; duration?: number }>
    captions?: Array<{ text: string; start: number; duration: number }>
    effectId?: string
    width?: number
    height?: number
  }) => Promise<{ id: string; status: string }>,
): ToolDefinition {
  return {
    name: 'render_video',
    description:
      'Render video MP4 dọc 9:16 (TikTok/Reels/Shorts, không watermark) bằng Concat engine: ' +
      'nối các clip, chèn caption từng đoạn, phủ hiệu ứng. ' +
      'Job chạy nền theo hàng đợi (Concat render 1 video tại một thời điểm) — trả về job id để kiểm tra tiến độ. ' +
      'Dùng khi người dùng muốn dựng video từ kịch bản/nguồn quay có sẵn.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên video', minLength: 1, maxLength: 120 },
        clips: {
          type: 'array',
          description: 'Danh sách clip (tối đa 20). Mỗi clip là URL video/ảnh công khai.',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'URL http(s) công khai của video/ảnh' },
              start: { type: 'number', description: 'Vị trí giây trên timeline (bỏ qua = nối tiếp)' },
              duration: { type: 'number', description: 'Ghi đè độ dài giây (bỏ qua = độ dài thật)' },
            },
            required: ['source'],
            additionalProperties: false,
          },
        },
        captions: {
          type: 'array',
          description: 'Caption chèn từng đoạn (lower-third, nằm trên video).',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', minLength: 1 },
              start: { type: 'number' },
              duration: { type: 'number' },
            },
            required: ['text', 'start', 'duration'],
            additionalProperties: false,
          },
        },
        effectId: {
          type: 'string',
          description: 'ID hiệu ứng phủ toàn video (lấy từ render_video catalogue — hiện để trống nếu chưa biết).',
        },
        width: {
          type: 'number',
          description: 'Chiều rộng px (144–4096, bỏ qua = 1080). Dùng 720 khi server yếu RAM.',
        },
        height: {
          type: 'number',
          description: 'Chiều cao px (144–4096, bỏ qua = 1920). Dùng 1280 khi server yếu RAM.',
        },
      },
      required: ['name', 'clips'],
      additionalProperties: false,
    },
    execute: async (args) => {
      try {
        const job = await render({
          name: args['name'] as string,
          clips: args['clips'] as Array<{ source: string; start?: number; duration?: number }>,
          captions: args['captions'] as Array<{ text: string; start: number; duration: number }> | undefined,
          effectId: args['effectId'] as string | undefined,
          width: args['width'] as number | undefined,
          height: args['height'] as number | undefined,
        })
        return `Đã xếp job render video "${args['name']}" (id ${job.id}, trạng thái ${job.status}). Hỏi tôi "trạng thái job ${job.id}" để kiểm tra tiến độ và lấy link tải MP4.`
      } catch (err) {
        return `Không tạo được job render: ${(err as Error).message}`
      }
    },
  }
}

export interface RenderJobStatus {
  id: string
  name: string
  status: string
  progress: number
  error: string | null
  hasFile: boolean
  createdAt: Date
  updatedAt: Date
}

/** Tra cứu trạng thái job render video + link tải MP4 khi xong. */
export function makeRenderStatusTool(
  lookup: (jobId?: string) => Promise<{ jobs: RenderJobStatus[]; downloadUrl: (id: string) => string }>,
): ToolDefinition {
  return {
    name: 'render_status',
    description:
      'Kiểm tra trạng thái job render video (queued/running/done/failed) và lấy link tải file MP4 khi job đã xong. ' +
      'Gọi không tham số để liệt kê các job gần nhất, hoặc truyền jobId để xem một job cụ thể. ' +
      'Dùng khi người dùng hỏi tiến độ video đã render.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'ID job render (bỏ qua để liệt kê job gần nhất).' },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      try {
        const { jobs, downloadUrl } = await lookup(args['jobId'] as string | undefined)
        if (jobs.length === 0) return 'Chưa có job render nào.'
        return jobs
          .map((j) => {
            const base = `Job "${j.name}" (id ${j.id}): trạng thái ${j.status}, tiến độ ${j.progress}%`
            const err = j.status === 'failed' && j.error ? ` — lỗi: ${j.error}` : ''
            const dl = j.status === 'done' && j.hasFile ? ` — tải MP4: ${downloadUrl(j.id)}` : ''
            return base + err + dl
          })
          .join('\n')
      } catch (err) {
        return `Không tra được trạng thái render: ${(err as Error).message}`
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

/** Tool hủy một job render đang xếp hàng/chạy — dùng để dừng job kẹt hoặc không cần nữa. */
export function makeRenderCancelTool(
  cancel: (jobId: string) => Promise<{ id: string; status: string }>,
): ToolDefinition {
  return {
    name: 'render_cancel',
    description:
      'Hủy một job render video đang xếp hàng (queued) hoặc đang chạy (running). ' +
      'Dùng khi người dùng muốn dừng video đang render, hoặc khi job kẹt cần dừng để tạo lại.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'ID job render cần hủy.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
    execute: async (args) => {
      try {
        const job = await cancel(args['jobId'] as string)
        return `Đã hủy job render ${job.id} (trạng thái: ${job.status}).`
      } catch (err) {
        return `Không hủy được job render: ${(err as Error).message}`
      }
    },
  }
}
