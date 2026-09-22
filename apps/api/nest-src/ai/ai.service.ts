import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { encrypt, decrypt } from '@orh/crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getProviderMeta, publicProviderMeta, type AiProviderMeta, type AiProviderId } from './ai.providers'
import type { ConnectAiDto, ChatDto, ChatMessageDto } from './dto'

const VALIDATE_TIMEOUT_MS = 10_000
const CHAT_TIMEOUT_MS = 90_000

export interface EmbeddingKeyInfo {
  meta: AiProviderMeta
  apiKey: string
  /** Số chiều gốc của model embedding */
  dims: 768 | 1536
}

/**
 * AiService — quản lý API key các nền tảng AI của user và proxy chat.
 *
 * BẢO MẬT:
 * - API key chỉ tồn tại ở server: validate → mã hóa AES-256-GCM → lưu DB.
 * - KHÔNG BAO GIỜ: trả key về frontend, log key, đưa key vào audit metadata hay error message.
 * - Mọi lỗi từ provider đều được sanitize (thay key bằng [redacted]) trước khi trả về.
 */

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function safeBodyText(text: string): string {
  return text.length > 500 ? text.slice(0, 500) + '…' : text
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /** Metadata public cho frontend — không chứa secret hay baseUrl nội bộ. */
  listProviders() {
    return publicProviderMeta()
  }

  // ─── Validate API key bằng 1 call nhẹ (timeout 10s) ──────────────────────

  /**
   * Trả về true nếu key hợp lệ.
   * Ném BadRequestException('API key không hợp lệ…') khi key sai,
   * HttpException 502 khi không kết nối được tới provider (lỗi mạng).
   */
  private async validateKey(meta: AiProviderMeta, apiKey: string): Promise<void> {
    try {
      let valid: boolean
      switch (meta.kind) {
        case 'gemini':
          valid = await this.validateGemini(meta, apiKey)
          break
        case 'anthropic':
          valid = await this.validateAnthropic(meta, apiKey)
          break
        default:
          valid = await this.validateOpenAiCompatible(meta, apiKey)
      }
      if (!valid) {
        throw new BadRequestException(
          `API key không hợp lệ cho ${meta.name}. Hãy kiểm tra lại key và quyền truy cập.`,
        )
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      // Lỗi mạng/timeout khi validate → 502, KHÔNG kết luận key sai
      throw new HttpException(
        `Không kết nối được tới ${meta.name} để kiểm tra key. Hãy thử lại sau.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
  }

  private async validateGemini(meta: AiProviderMeta, apiKey: string): Promise<boolean> {
    const res = await fetchTimeout(
      `${meta.baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      {},
      VALIDATE_TIMEOUT_MS,
    )
    return res.ok
  }

  private async validateOpenAiCompatible(meta: AiProviderMeta, apiKey: string): Promise<boolean> {
    const res = await fetchTimeout(`${meta.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, VALIDATE_TIMEOUT_MS)
    if (res.status === 401 || res.status === 403) return false
    return res.ok
  }

  private async validateAnthropic(meta: AiProviderMeta, apiKey: string): Promise<boolean> {
    // Anthropic không có endpoint kiểm tra key riêng → dùng 1 messages call tối thiểu.
    // Key đúng nhưng model sai vẫn trả 404 (not_found_error) → coi là key HỢP LỆ.
    // Chỉ 401/authentication_error mới là key SAI.
    const res = await fetchTimeout(`${meta.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    }, VALIDATE_TIMEOUT_MS)
    if (res.ok) return true
    if (res.status === 401 || res.status === 403) return false
    try {
      const data = (await res.json()) as { error?: { type?: string } }
      const type = data?.error?.type ?? ''
      // Model không tồn tại / không có quyền dùng model — nhưng key thì đúng
      if (type === 'not_found_error' || res.status === 404) return true
      if (type === 'authentication_error') return false
    } catch {
      // body không parse được → không kết luận
    }
    return false
  }

  // ─── CRUD connections ────────────────────────────────────────────────────

  /** POST /ai/connections — validate key rồi mã hóa & lưu (upsert). */
  async connect(workspaceId: string, dto: ConnectAiDto, ip?: string) {
    const meta = getProviderMeta(dto.provider)
    if (!meta) throw new BadRequestException('Provider không được hỗ trợ.')

    const apiKey = dto.apiKey.trim()
    // KHÔNG log apiKey ở bất cứ đâu trong hàm này

    await this.validateKey(meta, apiKey)

    let keyCipher: string
    try {
      keyCipher = encrypt(apiKey)
    } catch {
      throw new InternalServerErrorException(
        'Lỗi mã hóa: TOKEN_ENCRYPTION_KEY chưa được cấu hình đúng.',
      )
    }

    const keyHint = `••••${apiKey.slice(-4)}`
    const now = new Date()
    const conn = await this.prisma.aiConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: meta.id } },
      create: {
        workspaceId,
        provider: meta.id,
        keyCipher,
        keyHint,
        status: 'active',
        validatedAt: now,
      },
      update: { keyCipher, keyHint, status: 'active', validatedAt: now },
    })

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'ai_connected',
      provider: meta.id,
      entityType: 'ai_connection',
      targetId: conn.id,
      result: 'success',
      ip,
    })

    return {
      provider: conn.provider,
      status: conn.status,
      keyHint: conn.keyHint,
      validatedAt: conn.validatedAt,
    }
  }

  /** GET /ai/connections — KHÔNG trả keyCipher. */
  async list(workspaceId: string) {
    const conns = await this.prisma.aiConnection.findMany({
      where: { workspaceId },
      orderBy: { provider: 'asc' },
    })
    return conns.map((c) => ({
      provider: c.provider,
      status: c.status,
      keyHint: c.keyHint,
      validatedAt: c.validatedAt,
      lastUsedAt: c.lastUsedAt,
    }))
  }

  /** DELETE /ai/connections/:provider */
  async remove(workspaceId: string, provider: string, ip?: string) {
    const meta = getProviderMeta(provider)
    if (!meta) throw new BadRequestException('Provider không được hỗ trợ.')

    const deleted = await this.prisma.aiConnection.deleteMany({
      where: { workspaceId, provider: meta.id },
    })
    if (deleted.count === 0) {
      throw new NotFoundException(`Chưa kết nối ${meta.name}.`)
    }

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'ai_disconnected',
      provider: meta.id,
      entityType: 'ai_connection',
      result: 'success',
      ip,
    })

    return { ok: true, provider: meta.id }
  }

  // ─── Chat ────────────────────────────────────────────────────────────────

  /**
   * Lấy key chat đã giải mã cho agent loop / các service nội bộ khác.
   * Ném BadRequestException khi chưa kết nối hoặc key bị vô hiệu — cùng UX với chat().
   * KHÔNG log apiKey.
   */
  async getChatKey(
    workspaceId: string,
    provider: AiProviderId,
  ): Promise<{ meta: AiProviderMeta; apiKey: string; connId: string }> {
    const meta = getProviderMeta(provider)
    if (!meta) throw new BadRequestException('Provider không được hỗ trợ.')

    const conn = await this.prisma.aiConnection.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: meta.id } },
    })
    if (!conn || conn.status !== 'active') {
      throw new BadRequestException(
        `Chưa kết nối ${meta.name} hoặc key đã bị vô hiệu. Hãy kết nối lại ở Cài đặt → AI Pro.`,
      )
    }

    let apiKey: string
    try {
      apiKey = decrypt(conn.keyCipher)
    } catch {
      throw new InternalServerErrorException(
        'Lỗi giải mã key: TOKEN_ENCRYPTION_KEY chưa được cấu hình đúng.',
      )
    }
    return { meta, apiKey, connId: conn.id }
  }

  /** POST /ai/chat — giải mã key server-side rồi proxy tới provider. */
  async chat(workspaceId: string, dto: ChatDto, ip?: string) {
    const meta = getProviderMeta(dto.provider)
    if (!meta) throw new BadRequestException('Provider không được hỗ trợ.')

    const conn = await this.prisma.aiConnection.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: meta.id } },
    })
    if (!conn || conn.status !== 'active') {
      throw new BadRequestException(
        `Chưa kết nối ${meta.name} hoặc key đã bị vô hiệu. Hãy kết nối lại ở Cài đặt → AI Pro.`,
      )
    }

    let apiKey: string
    try {
      apiKey = decrypt(conn.keyCipher)
    } catch {
      throw new InternalServerErrorException(
        'Lỗi giải mã key: TOKEN_ENCRYPTION_KEY chưa được cấu hình đúng.',
      )
    }

    const model = dto.model?.trim() || meta.defaultModel
    const maxTokens = dto.maxTokens ?? 1024

    try {
      let result: { content: string; usage?: Record<string, unknown> }
      switch (meta.kind) {
        case 'gemini':
          result = await this.chatGemini(meta, apiKey, model, dto.messages, maxTokens, conn.id)
          break
        case 'anthropic':
          result = await this.chatAnthropic(meta, apiKey, model, dto.messages, maxTokens, conn.id)
          break
        default:
          result = await this.chatOpenAiCompatible(meta, apiKey, model, dto.messages, maxTokens, conn.id)
      }

      await this.prisma.aiConnection.update({
        where: { id: conn.id },
        data: { lastUsedAt: new Date() },
      })
      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'ai_chat',
        provider: meta.id,
        entityType: 'ai_connection',
        targetId: conn.id,
        result: 'success',
        // Chỉ log metadata — KHÔNG log nội dung chat của user
        metadata: { model, messageCount: dto.messages.length },
        ip,
      })

      return { content: result.content, model, usage: result.usage ?? null, provider: meta.id }
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new HttpException(
        `Không kết nối được tới ${meta.name}. Hãy thử lại sau.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
  }

  /** Thay key bằng [redacted] trong mọi message lỗi trước khi trả về client. */
  private sanitizeError(message: string, apiKey: string): string {
    return safeBodyText(message.split(apiKey).join('[redacted]'))
  }

  // ─── Embeddings (dùng cho RAG) ────────────────────────────────────────────

  /**
   * Lấy key để tạo embedding: ưu tiên OpenAI (text-embedding-3-small, 1536 dim),
   * fallback Gemini (gemini-embedding-001, 1536 dim).
   * (text-embedding-004 đã bị Google khai tử từ 14/01/2026.)
   * Ném BadRequestException kèm hướng dẫn khi workspace chưa có key nào.
   */
  async getEmbeddingKey(workspaceId: string): Promise<EmbeddingKeyInfo> {
    const conns = await this.prisma.aiConnection.findMany({
      where: { workspaceId, status: 'active' },
    })
    const chosen =
      conns.find((c) => c.provider === 'openai') ?? conns.find((c) => c.provider === 'gemini')
    if (!chosen) {
      throw new BadRequestException(
        'Chưa có API key nào để tạo embedding. Hãy vào Cài đặt → AI Pro để thêm key OpenAI (khuyến nghị) hoặc Gemini.',
      )
    }
    const meta = getProviderMeta(chosen.provider)
    if (!meta) {
      throw new BadRequestException('Provider không được hỗ trợ.')
    }
    let apiKey: string
    try {
      apiKey = decrypt(chosen.keyCipher)
    } catch {
      throw new InternalServerErrorException('Lỗi giải mã key: TOKEN_ENCRYPTION_KEY chưa đúng.')
    }
    // KHÔNG log apiKey
    return { meta, apiKey, dims: 1536 }
  }

  /**
   * Tạo embedding cho danh sách text. Luôn trả về vector 1536 chiều.
   * embedGemini tự chuẩn hoá mọi số chiều trả về (cắt ngắn nếu dài hơn,
   * zero-pad nếu ngắn hơn) nên tương thích với chunks đã lưu trước đây.
   */
  async embed(workspaceId: string, texts: string[], ip?: string): Promise<number[][]> {
    if (texts.length === 0) return []
    const { meta, apiKey, dims } = await this.getEmbeddingKey(workspaceId)

    try {
      const raw: number[][] =
        meta.id === 'openai'
          ? await this.embedOpenAi(meta, apiKey, texts)
          : await this.embedGemini(meta, apiKey, texts)

      const vectors =
        dims === 768
          ? raw.map((v) => [...v, ...new Array(1536 - v.length).fill(0)])
          : raw

      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'ai_embed',
        provider: meta.id,
        entityType: 'ai_connection',
        result: 'success',
        // Chỉ metadata — không log nội dung text
        metadata: { texts: texts.length, dims: 1536 },
        ip,
      })
      return vectors
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new HttpException(
        `Không tạo được embedding qua ${meta.name}. Hãy thử lại sau.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
  }

  private async embedOpenAi(
    meta: AiProviderMeta,
    apiKey: string,
    texts: string[],
  ): Promise<number[][]> {
    const res = await fetchTimeout(
      `${meta.baseUrl}/embeddings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
      },
      CHAT_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) {
      throw new HttpException(
        `${meta.name} trả lỗi ${res.status}: ${this.sanitizeError(text, apiKey)}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    const data = JSON.parse(text) as { data?: Array<{ embedding?: number[] }> }
    const vectors = (data.data ?? []).map((d) => d.embedding ?? [])
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== 1536)) {
      throw new HttpException(
        `Phản hồi embedding từ ${meta.name} không hợp lệ.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    return vectors
  }

  private async embedGemini(
    meta: AiProviderMeta,
    apiKey: string,
    texts: string[],
  ): Promise<number[][]> {
    const res = await fetchTimeout(
      `${meta.baseUrl}/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text: t }] },
            // Xin đúng 1536 dim (model hỗ trợ Matryoshka 128–3072).
            // Nếu API bỏ qua field này, đoạn chuẩn hoá bên dưới vẫn xử lý được.
            outputDimensionality: 1536,
          })),
        }),
      },
      CHAT_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) {
      throw new HttpException(
        `${meta.name} trả lỗi ${res.status}: ${this.sanitizeError(text, apiKey)}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    const data = JSON.parse(text) as {
      responses?: Array<{ embedding?: { values?: number[]; value?: number[] } }>
      embeddings?: Array<{ values?: number[]; value?: number[] }>
    }
    // Google có thể trả 1 trong 2 dạng:
    // - { responses: [{ embedding: { values: [...] } }] } (tài liệu batchEmbedContents)
    // - { embeddings: [{ values: [...] }] } (thực tế API trả về cho gemini-embedding-001)
    const raw: number[][] = []
    if (Array.isArray(data.responses)) {
      for (const r of data.responses) raw.push(r.embedding?.values ?? r.embedding?.value ?? [])
    } else if (Array.isArray(data.embeddings)) {
      for (const e of data.embeddings) raw.push(e.values ?? e.value ?? [])
    }
    // Chuẩn hoá mọi vector về đúng 1536 chiều:
    // - dài hơn → cắt ngắn (an toàn với Matryoshka embedding như gemini-embedding-001)
    // - ngắn hơn → zero-pad (cosine similarity được bảo toàn)
    const vectors = raw.map((v) => {
      if (v.length === 1536) return v
      if (v.length > 1536) return v.slice(0, 1536)
      return [...v, ...new Array(1536 - v.length).fill(0)]
    })
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== 1536)) {
      // Chẩn đoán không nhạy cảm: chỉ đếm số lượng, số chiều và tên field gốc
      const firstDim = raw.length > 0 ? raw[0].length : -1
      const topKeys = Object.keys(data ?? {}).join(',')
      throw new HttpException(
        `Phản hồi embedding từ ${meta.name} không hợp lệ ` +
          `(gửi ${texts.length}, nhận ${raw.length} vectors, ` +
          `dim đầu: ${firstDim}, keys: ${topKeys}).`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    return vectors
  }

  private providerError(
    meta: AiProviderMeta,
    apiKey: string,
    res: Response,
    bodyText: string,
    connId: string,
  ): HttpException {
    // Key bị thu hồi/sai → đánh dấu invalid cho ĐÚNG connection này để user biết cần kết nối lại
    if (res.status === 401 || res.status === 403) {
      this.prisma.aiConnection
        .update({ where: { id: connId }, data: { status: 'invalid' } })
        .catch(() => {})
      return new HttpException(
        `API key ${meta.name} đã bị từ chối (có thể đã bị thu hồi). Hãy kết nối lại key mới.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    return new HttpException(
      `${meta.name} trả lỗi ${res.status}: ${this.sanitizeError(bodyText, apiKey)}`,
      HttpStatus.BAD_GATEWAY,
    )
  }

  private async chatGemini(
    meta: AiProviderMeta,
    apiKey: string,
    model: string,
    messages: ChatMessageDto[],
    maxTokens: number,
    connId: string,
  ) {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
    const res = await fetchTimeout(
      `${meta.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
      CHAT_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) throw this.providerError(meta, apiKey, res, text, connId)
    const data = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: Record<string, unknown>
    }
    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!content) {
      throw new HttpException(
        `${meta.name} không trả về nội dung (có thể bị chặn bởi bộ lọc).`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    return { content, usage: data.usageMetadata }
  }

  private async chatOpenAiCompatible(
    meta: AiProviderMeta,
    apiKey: string,
    model: string,
    messages: ChatMessageDto[],
    maxTokens: number,
    connId: string,
  ) {
    const res = await fetchTimeout(`${meta.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: maxTokens,
      }),
    }, CHAT_TIMEOUT_MS)
    const text = await res.text()
    if (!res.ok) throw this.providerError(meta, apiKey, res, text, connId)
    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: Record<string, unknown>
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    if (!content) {
      throw new HttpException(
        `${meta.name} không trả về nội dung.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    return { content, usage: data.usage }
  }

  private async chatAnthropic(
    meta: AiProviderMeta,
    apiKey: string,
    model: string,
    messages: ChatMessageDto[],
    maxTokens: number,
    connId: string,
  ) {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const rest = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))
    const res = await fetchTimeout(`${meta.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: rest,
      }),
    }, CHAT_TIMEOUT_MS)
    const text = await res.text()
    if (!res.ok) throw this.providerError(meta, apiKey, res, text, connId)
    const data = JSON.parse(text) as {
      content?: Array<{ type?: string; text?: string }>
      usage?: Record<string, unknown>
    }
    const content =
      data.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('') ?? ''
    if (!content) {
      throw new HttpException(
        `${meta.name} không trả về nội dung.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    return { content, usage: data.usage }
  }
}
