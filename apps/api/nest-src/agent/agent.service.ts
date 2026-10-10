import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common'
import { AiService } from '../ai/ai.service'
import { RagService } from '../rag/rag.service'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getProviderMeta, type AiProviderId, type AiProviderMeta } from '../ai/ai.providers'
import { FALLBACK_PRIORITY } from '../ai/ai.service'
import { ToolRegistry, type ToolDefinition } from './tool-registry'
import { TinyFishService } from '../ai/tinyfish.service'
import {
  runAgent,
  buildAgentSystemPrompt,
  OpenAiCompatibleBackend,
  GeminiBackend,
  AnthropicBackend,
  type AgentMessage,
  type ChatBackend,
} from './agent-loop'
import {
  buildBuiltinTools,
  makeRenderVideoTool,
  makeRenderStatusTool,
  makeRenderCancelTool,
  makeWooProductsTool,
  type TinyFishWebBackend,
} from './builtin-tools'
import { videoTools } from './video-tools'
import type { AgentRunDto } from './dto'
import { RenderService } from '../render/render.service'
import { WooCommerceService } from '../woocommerce/woocommerce.service'

/**
 * AgentService — AI agent gọi tools (port kiến trúc runner của Strix).
 *
 * Luồng: POST /ai/agent/run → lấy key đã mã hóa server-side → vòng lặp
 * think→act→observe qua dialect tool-calling của từng provider → trả lời cuối
 * kèm trace các tool đã gọi.
 *
 * BẢO MẬT (giữ nguyên posture của AiService):
 * - API key chỉ tồn tại ở server, không bao giờ trả về client/log.
 * - Tool là allowlist đóng — không có shell/exec tùy ý (Render không có
 *   Docker sandbox như Strix nên port đúng phần an toàn).
 * - Audit chỉ log metadata (số turn, tên tool), không log nội dung chat.
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly aiService: AiService,
    private readonly ragService: RagService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly renderService: RenderService,
    private readonly wooService: WooCommerceService,
    private readonly tinyFishService: TinyFishService,
  ) {}

  /**
   * Backend TinyFish cho tool web_search/fetch_url/web_agent.
   * Kiểm tra key 1 lần cho cả run: có key → backend đầy đủ; chưa kết nối →
   * null → web_search/fetch_url tự fallback như cũ, web_agent không đăng ký.
   */
  private async tinyFishBackend(workspaceId: string): Promise<TinyFishWebBackend | null> {
    const apiKey = await this.tinyFishService.getApiKey(workspaceId)
    if (!apiKey) return null
    return {
      search: async (query: string) => {
        const { results } = await this.tinyFishService.search(apiKey, query, { limit: 5 })
        return results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }))
      },
      fetchUrl: async (url: string) => {
        const [r] = await this.tinyFishService.fetchUrls(apiKey, [url])
        return r?.text?.trim() ? r.text : null
      },
      runAgent: async (url: string, goal: string) =>
        this.tinyFishService.runAgent(apiKey, url, goal),
    }
  }

  private async buildRegistry(workspaceId: string): Promise<ToolRegistry> {
    const registry = new ToolRegistry()
    for (const tool of buildBuiltinTools({
      knowledgeSearch: (query, topK) => this.ragService.searchChunks(workspaceId, query, topK),
      listConnectedAi: () => this.aiService.list(workspaceId),
      tinyfish: await this.tinyFishBackend(workspaceId),
    })) {
      registry.register(tool)
    }
    // render_video: luôn đăng ký; execute tự báo khi renderer chưa bật.
    registry.register(
      makeRenderVideoTool((spec) =>
        this.renderService.createJob(workspaceId, spec).then((job) => ({ id: job.id, status: job.status })),
      ),
    )
    // render_status: tra cứu tiến độ job + link tải MP4.
    registry.register(
      makeRenderStatusTool(async (jobId?: string) => {
        const jobs = jobId
          ? [await this.renderService.getJob(workspaceId, jobId)]
          : await this.renderService.listJobs(workspaceId, 10)
        const base = (process.env.API_URL || '').replace(/\/+$/, '')
        return { jobs, downloadUrl: (id: string) => `${base}/render/jobs/${id}/file` }
      }),
    )
    // woo_products: tìm sản phẩm thật trong cửa hàng WooCommerce đã kết nối.
    registry.register(
      makeWooProductsTool((keyword, limit) => this.wooService.searchForAgent(workspaceId, keyword, limit)),
    )
    // render_cancel: dừng job đang queued/running (vd job kẹt, OOM-loop).
    registry.register(
      makeRenderCancelTool(async (jobId: string) => {
        const job = await this.renderService.cancelJob(workspaceId, jobId)
        return { id: job.id, status: job.status }
      }),
    )
    // video faceless pipeline: brief (G0 originality) / script (claim gate) / risk score.
    for (const tool of videoTools) {
      registry.register(tool)
    }
    return registry
  }

  /** GET /ai/agent/tools — metadata tools cho frontend (không chứa secret). */
  async listTools(): Promise<Array<Pick<ToolDefinition, 'name' | 'description' | 'parameters'>>> {
    // workspaceId rỗng: các factory chỉ dùng khi execute, list metadata không cần
    return (await this.buildRegistry('')).list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }

  private buildBackend(
    kind: string,
    baseUrl: string,
    apiKey: string,
    model: string,
    maxTokens: number,
  ): ChatBackend {
    switch (kind) {
      case 'gemini':
        return new GeminiBackend(baseUrl, apiKey, model, maxTokens)
      case 'anthropic':
        return new AnthropicBackend(baseUrl, apiKey, model, maxTokens)
      default:
        return new OpenAiCompatibleBackend(baseUrl, apiKey, model, maxTokens)
    }
  }

  /**
   * Combo fallback cho agent: lấy key provider chính, nếu lỗi phía server (5xx:
   * key giải mã lỗi, provider sập, hết quota…) thì tự thử các key khác đã kết
   * nối theo FALLBACK_PRIORITY. Lỗi do user (400: chưa kết nối…) thì báo thẳng.
   */
  private async resolveAgentKey(workspaceId: string, provider: AiProviderId) {
    try {
      const primary = await this.aiService.getChatKey(workspaceId, provider)
      return { ...primary, fallback: null as { from: string; to: string } | null }
    } catch (err) {
      const status = err instanceof HttpException ? err.getStatus() : 0
      if (status < 500) throw err
      for (const fbId of FALLBACK_PRIORITY.filter((id) => id !== provider)) {
        try {
          const fb = await this.aiService.getChatKey(workspaceId, fbId)
          return { ...fb, fallback: { from: provider, to: fbId } }
        } catch {
          // Thử key tiếp theo
        }
      }
      throw err
    }
  }

  /** POST /ai/agent/run */
  async run(workspaceId: string, dto: AgentRunDto, ip?: string) {
    const meta = getProviderMeta(dto.provider)
    if (!meta) throw new BadRequestException('Provider không được hỗ trợ.')
    if (meta.kind === 'tinyfish' || meta.kind === 'pollinations') {
      throw new BadRequestException(
        `${meta.name} là API tiện ích, không phải model chat. Hãy chọn một provider chat khác cho agent.`,
      )
    }

    const primary = await this.resolveAgentKey(workspaceId, dto.provider)
    // KHÔNG log apiKey ở bất cứ đâu trong hàm này

    // Combo fallback khi CHẠY (giống ai.chat): provider chính lỗi phía server
    // giữa chừng (429/5xx — VD: VyceAI rate limit/timeout) → thử key khác đã
    // kết nối theo FALLBACK_PRIORITY. Lỗi do user/key hỏng thì báo thẳng.
    const tried = new Set<string>([primary.meta.id])
    let cur = primary
    let fbInfo = primary.fallback
    let lastErr: unknown = null
    for (;;) {
      try {
        return await this.runOnce(workspaceId, dto, ip, cur.meta, cur.apiKey, cur.connId, fbInfo)
      } catch (err) {
        if (!this.isProviderSideError(err)) throw err
        lastErr = err
      }
      // Tìm provider dự phòng KẾ TIẾP đã kết nối trước khi chạy lại
      // (tránh chạy lại provider vừa lỗi khi key dự phòng chưa có)
      let next: { meta: AiProviderMeta; apiKey: string; connId: string } | null = null
      for (const id of FALLBACK_PRIORITY) {
        if (tried.has(id)) continue
        tried.add(id)
        try {
          next = await this.aiService.getChatKey(workspaceId, id)
          break
        } catch {
          // Chưa kết nối provider này → thử provider tiếp theo
        }
      }
      if (!next) break
      fbInfo = { from: primary.meta.id, to: next.meta.id }
      cur = { ...next, fallback: fbInfo }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
    const safe = msg.split(cur.apiKey).join('[redacted]').slice(0, 500)
    throw new HttpException(
      `Agent chạy lỗi qua ${cur.meta.name}: ${safe}`,
      HttpStatus.BAD_GATEWAY,
    )
  }

  /**
   * Lỗi phía provider/server giữa chừng (đáng thử provider khác): 429/5xx từ backend,
   * hoặc provider trả 200 nhưng nội dung rỗng nhiều lần (VD: model free APInex quá tải).
   */
  private isProviderSideError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err)
    return /Provider trả lỗi (429|5\d\d)\b|không trả về nội dung/.test(msg)
  }

  /** Một lượt chạy agent với đúng 1 key. Lỗi 429/5xx được ném THÔ để run() thử provider khác. */
  private async runOnce(
    workspaceId: string,
    dto: AgentRunDto,
    ip: string | undefined,
    runMeta: AiProviderMeta,
    apiKey: string,
    connId: string,
    fallback: { from: string; to: string } | null,
  ) {

    const registry = await this.buildRegistry(workspaceId)
    let tools = registry.list()
    if (dto.tools && dto.tools.length > 0) {
      const unknown = dto.tools.filter((n) => !registry.has(n))
      if (unknown.length > 0) {
        throw new BadRequestException(`Tool không tồn tại: ${unknown.join(', ')}`)
      }
      const allow = new Set(dto.tools)
      tools = tools.filter((t) => allow.has(t.name))
    }

    // Đã fallback sang provider khác → dùng defaultModel của provider đó
    // (model user chọn có thể không tồn tại ở provider dự phòng)
    const model = fallback ? runMeta.defaultModel : dto.model?.trim() || runMeta.defaultModel
    const maxTokens = dto.maxTokens ?? 2048
    const backend = this.buildBackend(runMeta.kind, runMeta.baseUrl, apiKey, model, maxTokens)

    const messages: AgentMessage[] = [
      { role: 'system', content: buildAgentSystemPrompt(tools.map((t) => t.name)) },
      ...dto.messages.map((m): AgentMessage => ({ role: m.role, content: m.content })),
    ]

    try {
      const result = await runAgent({
        backend,
        tools,
        messages,
        maxTurns: dto.maxTurns ?? 6,
        workspaceId,
      })

      await this.prisma.aiConnection.update({
        where: { id: connId },
        data: { lastUsedAt: new Date() },
      })
      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'ai_agent_run',
        provider: runMeta.id,
        entityType: 'ai_connection',
        targetId: connId,
        result: 'success',
        // Chỉ metadata — KHÔNG log nội dung chat hay args của tool
        metadata: {
          model,
          turns: result.turns,
          stoppedReason: result.stoppedReason,
          tools: result.toolCalls.map((t) => t.name),
        },
        ip,
      })

      return {
        content: result.content,
        model,
        provider: runMeta.id,
        turns: result.turns,
        stoppedReason: result.stoppedReason,
        toolCalls: result.toolCalls.map((t) => ({
          name: t.name,
          ok: t.ok,
          ms: t.ms,
          truncated: t.truncated,
          output: t.output,
        })),
        ...(fallback ? { fallback } : {}),
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
      const message = err instanceof Error ? err.message : String(err)
      // Key bị thu hồi → đánh dấu invalid cho ĐÚNG connection (giống chat())
      if (/trả lỗi (401|403)\b/.test(message)) {
        this.prisma.aiConnection
          .update({ where: { id: connId }, data: { status: 'invalid' } })
          .catch(() => {})
        throw new HttpException(
          `API key ${runMeta.name} đã bị từ chối (có thể đã bị thu hồi). Hãy kết nối lại key mới.`,
          HttpStatus.BAD_GATEWAY,
        )
      }
      // Lỗi phía provider (429/5xx) → ném thô để run() tự thử provider dự phòng
      if (this.isProviderSideError(err)) throw err
      // Sanitize: thay key bằng [redacted] nếu chẳng may lọt vào message
      const safe = message.split(apiKey).join('[redacted]').slice(0, 500)
      throw new HttpException(
        `Agent chạy lỗi qua ${runMeta.name}: ${safe}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
  }
}
