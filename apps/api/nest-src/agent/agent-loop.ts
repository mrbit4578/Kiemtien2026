/**
 * Agent loop — port vòng lặp "think → act → observe" của Strix (core/execution.py)
 * sang TypeScript, chạy đa provider qua dialect tool-calling riêng của từng họ.
 *
 * File này thuần TypeScript, không phụ thuộc NestJS để dễ unit-test.
 * Key/decrypt/audit nằm ở AgentService (NestJS wrapper).
 */
import type { ToolDefinition } from './tool-registry'
import { validateToolArgs, ToolArgError } from './tool-registry'
import { fetchTimeout } from '../common/safe-fetch'

// ─── Message model trung lập ────────────────────────────────────────────────

export interface ToolCallRequest {
  id: string
  name: string
  args: unknown
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** assistant → các tool model muốn gọi ở turn này */
  toolCalls?: ToolCallRequest[]
  /** tool → id của tool call mà message này trả kết quả */
  toolCallId?: string
  /** tool → tên tool đã chạy */
  toolName?: string
}

export interface AssistantTurn {
  text: string
  toolCalls: ToolCallRequest[]
}

/** Backend chat của một provider — dịch message model sang wire format riêng. */
export interface ChatBackend {
  readonly label: string
  send(messages: AgentMessage[], tools: ToolDefinition[]): Promise<AssistantTurn>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 90_000

function toolSchemaForPrompt(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }
}

/**
 * Gemini chỉ chấp nhận một tập con của JSON Schema trong function declarations.
 * Các field như `additionalProperties` hay `$schema` bị API từ chối với 400
 * (Invalid JSON payload received. Unknown name "additionalProperties").
 */
function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini)
  if (schema !== null && typeof schema === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === 'additionalProperties' || k === '$schema') continue
      out[k] = sanitizeSchemaForGemini(v)
    }
    return out
  }
  return schema
}

function toolSchemaForGemini(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: sanitizeSchemaForGemini(tool.parameters),
  }
}

// ─── Dialect: OpenAI-compatible (OpenAI, xAI/Grok, DeepSeek) ────────────────

export class OpenAiCompatibleBackend implements ChatBackend {
  readonly label = 'openai-compatible'
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  private toWire(messages: AgentMessage[]): Array<Record<string, unknown>> {
    return messages.map((m) => {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
          })),
        }
      }
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
      }
      return { role: m.role, content: m.content }
    })
  }

  async send(messages: AgentMessage[], tools: ToolDefinition[]): Promise<AssistantTurn> {
    const res = await fetchTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: this.toWire(messages),
          max_tokens: this.maxTokens,
          ...(tools.length > 0
            ? {
                tools: tools.map((t) => ({ type: 'function', function: toolSchemaForPrompt(t) })),
                tool_choice: 'auto',
              }
            : {}),
        }),
      },
      PROVIDER_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) throw new Error(`Provider trả lỗi ${res.status}: ${text.slice(0, 300)}`)
    const data = JSON.parse(text) as {
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
        }
      }>
    }
    const msg = data.choices?.[0]?.message
    const toolCalls: ToolCallRequest[] = (msg?.tool_calls ?? []).map((tc, i) => {
      let args: unknown = {}
      try {
        args = JSON.parse(tc.function?.arguments ?? '{}')
      } catch {
        args = {}
      }
      return { id: tc.id ?? `call_${i}`, name: tc.function?.name ?? '', args }
    })
    return { text: msg?.content ?? '', toolCalls }
  }
}

// ─── Dialect: Gemini ────────────────────────────────────────────────────────

export class GeminiBackend implements ChatBackend {
  readonly label = 'gemini'
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  private toContents(messages: AgentMessage[]): Array<Record<string, unknown>> {
    const contents: Array<Record<string, unknown>> = []
    const push = (role: string, parts: unknown[]) => {
      const last = contents[contents.length - 1] as { role?: string; parts?: unknown[] } | undefined
      if (last && last.role === role) {
        ;(last.parts as unknown[]).push(...parts)
      } else {
        contents.push({ role, parts })
      }
    }
    for (const m of messages) {
      if (m.role === 'system') continue // → systemInstruction
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const parts: unknown[] = []
        if (m.content) parts.push({ text: m.content })
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.args ?? {} } })
        }
        push('model', parts)
      } else if (m.role === 'tool') {
        push('user', [
          { functionResponse: { name: m.toolName, response: { output: m.content } } },
        ])
      } else if (m.role === 'assistant') {
        push('model', [{ text: m.content }])
      } else {
        push('user', [{ text: m.content }])
      }
    }
    return contents
  }

  async send(messages: AgentMessage[], tools: ToolDefinition[]): Promise<AssistantTurn> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const res = await fetchTimeout(
      `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: this.toContents(messages),
          generationConfig: { maxOutputTokens: this.maxTokens },
          ...(tools.length > 0
            ? { tools: [{ functionDeclarations: tools.map(toolSchemaForGemini) }] }
            : {}),
        }),
      },
      PROVIDER_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) throw new Error(`Provider trả lỗi ${res.status}: ${text.slice(0, 300)}`)
    const data = JSON.parse(text) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> }
      }>
    }
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const toolCalls: ToolCallRequest[] = []
    let out = ''
    parts.forEach((p, i) => {
      if (p.text) out += p.text
      if (p.functionCall?.name) {
        toolCalls.push({ id: `call_${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} })
      }
    })
    return { text: out, toolCalls }
  }
}

// ─── Dialect: Anthropic ─────────────────────────────────────────────────────

export class AnthropicBackend implements ChatBackend {
  readonly label = 'anthropic'
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  private toWire(messages: AgentMessage[]): Array<Record<string, unknown>> {
    const out: Array<{ role: string; content: unknown[] }> = []
    const push = (role: string, blocks: unknown[]) => {
      const last = out[out.length - 1]
      if (last && last.role === role) {
        last.content.push(...blocks)
      } else {
        out.push({ role, content: blocks })
      }
    }
    for (const m of messages) {
      if (m.role === 'system') continue
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const blocks: unknown[] = []
        if (m.content) blocks.push({ type: 'text', text: m.content })
        for (const tc of m.toolCalls) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} })
        }
        push('assistant', blocks)
      } else if (m.role === 'tool') {
        push('user', [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }])
      } else if (m.role === 'assistant') {
        push('assistant', [{ type: 'text', text: m.content }])
      } else {
        push('user', [{ type: 'text', text: m.content }])
      }
    }
    return out
  }

  async send(messages: AgentMessage[], tools: ToolDefinition[]): Promise<AssistantTurn> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const res = await fetchTimeout(
      `${this.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          ...(system ? { system } : {}),
          messages: this.toWire(messages),
          ...(tools.length > 0
            ? {
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.parameters,
                })),
              }
            : {}),
        }),
      },
      PROVIDER_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) throw new Error(`Provider trả lỗi ${res.status}: ${text.slice(0, 300)}`)
    const data = JSON.parse(text) as {
      content?: Array<
        | { type: 'text'; text?: string }
        | { type: 'tool_use'; id?: string; name?: string; input?: unknown }
      >
    }
    const toolCalls: ToolCallRequest[] = []
    let out = ''
    ;(data.content ?? []).forEach((b, i) => {
      if (b.type === 'text' && 'text' in b) out += b.text ?? ''
      if (b.type === 'tool_use') {
        toolCalls.push({
          id: (b as { id?: string }).id ?? `call_${i}`,
          name: (b as { name?: string }).name ?? '',
          args: (b as { input?: unknown }).input ?? {},
        })
      }
    })
    return { text: out, toolCalls }
  }
}

// ─── Agent runner: think → act → observe ────────────────────────────────────

export interface ToolCallTrace {
  name: string
  args: unknown
  ok: boolean
  /** Output đã truncate — dùng cho trace trả về client. */
  output: string
  truncated: boolean
  ms: number
}

export interface AgentRunOptions {
  backend: ChatBackend
  /** Tools khả dụng (đã lọc allowlist nếu có). */
  tools: ToolDefinition[]
  messages: AgentMessage[]
  /** Số turn tối đa. Mặc định 6, trần 12. */
  maxTurns?: number
  /** Timeout mỗi tool. Mặc định 20s. */
  toolTimeoutMs?: number
  onEvent?: (event: AgentEvent) => void
}

export type AgentEvent =
  | { type: 'turn'; turn: number }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; ms: number }

export interface AgentRunResult {
  content: string
  turns: number
  toolCalls: ToolCallTrace[]
  stoppedReason: 'done' | 'max_turns'
}

export const DEFAULT_MAX_TURNS = 6
export const MAX_TURNS_CAP = 12
export const DEFAULT_TOOL_TIMEOUT_MS = 20_000
/** Trần output mỗi tool đưa vào context — chống tràn context window. */
export const MAX_TOOL_OUTPUT_CHARS = 8_000

function truncateOutput(output: string): { output: string; truncated: boolean } {
  if (output.length <= MAX_TOOL_OUTPUT_CHARS) return { output, truncated: false }
  return { output: output.slice(0, MAX_TOOL_OUTPUT_CHARS) + '\n…[đã cắt bớt]', truncated: true }
}

async function runToolWithTimeout(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  ctx: { workspaceId: string },
  timeoutMs: number,
): Promise<{ output: string; ms: number }> {
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const output = await tool.execute(args, { workspaceId: ctx.workspaceId, signal: ctrl.signal })
    return { output: String(output ?? ''), ms: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Chạy vòng lặp agent cho đến khi model trả lời thẳng (không gọi tool nữa)
 * hoặc chạm trần maxTurns.
 */
export async function runAgent(
  opts: AgentRunOptions & { workspaceId: string },
): Promise<AgentRunResult> {
  const maxTurns = Math.min(Math.max(opts.maxTurns ?? DEFAULT_MAX_TURNS, 1), MAX_TURNS_CAP)
  const toolTimeoutMs = opts.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
  const byName = new Map(opts.tools.map((t) => [t.name, t]))
  const history: AgentMessage[] = [...opts.messages]
  const trace: ToolCallTrace[] = []

  let lastText = ''
  for (let turn = 1; turn <= maxTurns; turn++) {
    opts.onEvent?.({ type: 'turn', turn })
    const assistant = await opts.backend.send(history, opts.tools)
    lastText = assistant.text

    if (assistant.toolCalls.length === 0) {
      return { content: lastText, turns: turn, toolCalls: trace, stoppedReason: 'done' }
    }

    history.push({ role: 'assistant', content: assistant.text, toolCalls: assistant.toolCalls })

    for (const tc of assistant.toolCalls) {
      opts.onEvent?.({ type: 'tool_call', name: tc.name, args: tc.args })
      let ok = true
      let rawOutput: string
      let ms = 0
      const tool = byName.get(tc.name)
      if (!tool) {
        ok = false
        rawOutput = `Tool "${tc.name}" không tồn tại. Chỉ dùng các tool đã liệt kê.`
      } else {
        try {
          const args = validateToolArgs(tc.name, tool.parameters, tc.args)
          const r = await runToolWithTimeout(tool, args, { workspaceId: opts.workspaceId }, toolTimeoutMs)
          rawOutput = r.output
          ms = r.ms
        } catch (err) {
          ok = false
          ms = 0
          rawOutput =
            err instanceof ToolArgError
              ? `Args không hợp lệ: ${err.issues.join('; ')}`
              : `Tool lỗi: ${err instanceof Error ? err.message : String(err)}`
        }
      }
      const { output, truncated } = truncateOutput(rawOutput)
      trace.push({ name: tc.name, args: tc.args, ok, output, truncated, ms })
      opts.onEvent?.({ type: 'tool_result', name: tc.name, ok, ms })
      history.push({
        role: 'tool',
        content: output,
        toolCallId: tc.id,
        toolName: tc.name,
      })
    }
  }

  return { content: lastText, turns: maxTurns, toolCalls: trace, stoppedReason: 'max_turns' }
}

/**
 * System prompt cho agent mode của Kiemtien2026.
 *
 * Vai trò: "kiến trúc sư tăng trưởng" — mọi câu trả lời đều hướng tới chuỗi
 * giá trị VIRAL → TƯƠNG TÁC → THU NHẬP THỤ ĐỘNG ONLINE.
 * Cấu trúc học từ audit các system prompt Claude: identity, sứ mệnh, bối cảnh
 * nền tảng, khung tư duy, cách dùng tools, định dạng output, guardrails.
 */
export function buildAgentSystemPrompt(toolNames: string[]): string {
  return [
    '## Danh tính',
    'Bạn là trợ lý tăng trưởng AI của nền tảng Kiemtien2026, chạy ở chế độ agent: bạn có thể gọi các công cụ (tools) để lấy thông tin trước khi trả lời.',
    '',
    '## Sứ mệnh tối thượng',
    'Giúp người dùng đi trọn chuỗi giá trị: TẠO CONTENT VIRAL → ĐẨY TƯƠNG TÁC NHANH → XÂY DỰNG NGUỒN THU NHẬP THỤ ĐỘNG ONLINE.',
    'Mọi câu trả lời của bạn đều phải phục vụ trực tiếp hoặc gián tiếp cho sứ mệnh này. Khi người dùng hỏi việc không liên quan, bạn vẫn trả lời đầy đủ, rồi gợi ý một câu ngắn cách việc đó có thể gắn vào chuỗi giá trị trên.',
    '',
    '## Bối cảnh nền tảng bạn đang chạy trong',
    '- Content Studio: nơi soạn, duyệt và quản lý nội dung trước khi đăng.',
    '- Publish pipeline: đẩy nội dung đã duyệt lên Instagram, Facebook, TikTok (tự động, có hàng đợi và thử lại khi lỗi).',
    '- Canva pipeline: thiết kế trên Canva → export → đưa về Content Studio thành bản nháp.',
    '- Kho tri thức: tài liệu, ghi chú nội bộ của người dùng (truy vấn qua knowledge_search).',
    '- Nhiều AI provider đã kết nối (truy vấn qua list_connected_ai).',
    '',
    '## Khung tư duy viral — áp dụng cho mọi nội dung bạn tạo hoặc tư vấn',
    '1. HOOK 3 giây đầu: câu mở đầu phải khiến người ta dừng cuộn (số liệu sốc, tuyên bố ngược trực giác, câu hỏi xoáy vào nỗi đau, kết quả cụ thể). Không bao giờ mở đầu bằng lời chào chung chung.',
    '2. MỘT nội dung = MỘT cảm xúc mạnh + MỘT ý tưởng duy nhất (ngạc nhiên, đồng cảm, tò mò, tranh luận lành mạnh, truyền cảm hứng).',
    '3. Trend-jacking có chọn lọc: bắt trend đang lên nhưng phải bẻ lái về đúng ngách của người dùng, không đu trend vô nghĩa.',
    '4. CTA rõ ràng trong mọi nội dung: follow, bình luận từ khóa, lưu lại, chia sẻ, hoặc click link — mỗi bài chỉ một CTA chính.',
    '5. Format theo nền tảng: Reels/TikTok dọc 9:16, 15–45 giây, caption ngắn + hashtag vừa đủ; Facebook ưu tiên câu chuyện và thảo luận.',
    '6. Tần suất và giờ vàng: đề xuất lịch đăng cụ thể (dùng get_current_time để biết hôm nay là thứ mấy, giờ nào) thay vì nói chung chung.',
    '',
    '## Khung monetization — biến attention thành thu nhập thụ động',
    'Luôn đặt nội dung vào phễu 3 nấc và nói rõ nội dung này phục vụ nấc nào:',
    '- ATTENTION (thu hút): content viral, mở rộng tệp người xem.',
    '- TRUST (tin tưởng): content giá trị, chứng minh chuyên môn, nuôi dưỡng khán giả.',
    '- OFFER (chốt): giới thiệu nguồn thu — ưu tiên các mô hình thụ động: tiếp thị liên kết (affiliate), sản phẩm số (ebook, khóa học, template), quảng cáo, tài trợ.',
    'Nguyên tắc: 70% nội dung cho Attention + Trust, 30% cho Offer. Không bao giờ biến mọi bài đăng thành bài bán hàng.',
    '',
    '## Cách dùng tools',
    '- Chỉ gọi tool khi thật sự cần thông tin mà bạn không có; gọi với args đúng định dạng; đọc kỹ kết quả rồi mới trả lời.',
    '- web_search: trend mới, số liệu, giá cả, tin tức sau thời điểm training của bạn.',
    '- fetch_url: đọc bài viết/bài viral mẫu để PHÂN TÍCH CẤU TRÚC (hook, nhịp, CTA) — học cấu trúc, không copy nội dung.',
    '- knowledge_search: khi câu hỏi liên quan đến tài liệu, ghi chú nội bộ của người dùng.',
    '- get_current_time: khi cần giờ vàng đăng bài, trend theo thời gian, hoặc nội dung gắn với "hôm nay".',
    '- list_connected_ai: khi người dùng hỏi về AI provider đã kết nối.',
    `- Các tool khả dụng: ${toolNames.join(', ') || '(không có)'}.`,
    '',
    '## Phong cách trả lời',
    '- Trả lời bằng tiếng Việt, xưng mình/bạn; ngắn gọn, đi thẳng vào việc; hành động cụ thể quan trọng hơn lý thuyết.',
    '- Khi giao nội dung hoàn chỉnh, xuất theo cấu trúc: HOOK / NỘI DUNG (kịch bản hoặc caption) / CTA / HASHTAG / GIỜ ĐĂNG GỢI Ý / KÊNH PHÙ HỢP / NẤC PHỄU (Attention-Trust-Offer).',
    '- Khi tư vấn chiến lược, luôn kết thúc bằng 1–3 bước hành động tiếp theo người dùng có thể làm ngay trong Kiemtien2026 (ví dụ: "tạo 3 hook trong Content Studio", "đẩy video này lên queue publish TikTok").',
    '',
    '## Guardrails — tuyệt đối tuân thủ',
    '- Không bao giờ tiết lộ API key, token hay bất kỳ thông tin nhạy cảm nào.',
    '- Chỉ tư vấn tăng trưởng HỢP LỆ và bền vững: KHÔNG mua tương tác ảo, KHÔNG dùng bot seeding, KHÔNG spam, KHÔNG thủ thuật lách chính sách nền tảng.',
    '- KHÔNG hứa hẹn thu nhập chắc chắn ("đảm bảo X triệu/tháng", "làm giàu nhanh"). Luôn nói rõ tính bất định, rủi ro và rằng kết quả phụ thuộc vào thực thi đều đặn.',
    '- Tôn trọng bản quyền: học cấu trúc của content viral, không sao chép nguyên văn nội dung của người khác.',
    '- Từ chối nội dung lừa đảo, cờ bạc, và nội dung người lớn.',
  ].join('\n')
}
