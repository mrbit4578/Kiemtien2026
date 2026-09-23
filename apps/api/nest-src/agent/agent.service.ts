import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common'
import { AiService } from '../ai/ai.service'
import { RagService } from '../rag/rag.service'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getProviderMeta } from '../ai/ai.providers'
import { ToolRegistry, type ToolDefinition } from './tool-registry'
import {
  runAgent,
  buildAgentSystemPrompt,
  OpenAiCompatibleBackend,
  GeminiBackend,
  AnthropicBackend,
  type AgentMessage,
  type ChatBackend,
} from './agent-loop'
import { buildBuiltinTools, makeRenderVideoTool } from './builtin-tools'
import type { AgentRunDto } from './dto'
import { RenderService } from '../render/render.service'

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
  ) {}

  private buildRegistry(workspaceId: string): ToolRegistry {
    const registry = new ToolRegistry()
    for (const tool of buildBuiltinTools({
      knowledgeSearch: (query, topK) => this.ragService.searchChunks(workspaceId, query, topK),
      listConnectedAi: () => this.aiService.list(workspaceId),
    })) {
      registry.register(tool)
    }
    // render_video: luôn đăng ký; execute tự báo khi renderer chưa bật.
    registry.register(
      makeRenderVideoTool((spec) =>
        this.renderService.createJob(workspaceId, spec).then((job) => ({ id: job.id, status: job.status })),
      ),
    )
    return registry
  }

  /** GET /ai/agent/tools — metadata tools cho frontend (không chứa secret). */
  listTools(): Array<Pick<ToolDefinition, 'name' | 'description' | 'parameters'>> {
    // workspaceId rỗng: các factory chỉ dùng khi execute, list metadata không cần
    return this.buildRegistry('').list().map((t) => ({
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

  /** POST /ai/agent/run */
  async run(workspaceId: string, dto: AgentRunDto, ip?: string) {
    const meta = getProviderMeta(dto.provider)
    if (!meta) throw new BadRequestException('Provider không được hỗ trợ.')

    const { apiKey, connId } = await this.aiService.getChatKey(workspaceId, dto.provider)
    // KHÔNG log apiKey ở bất cứ đâu trong hàm này

    const registry = this.buildRegistry(workspaceId)
    let tools = registry.list()
    if (dto.tools && dto.tools.length > 0) {
      const unknown = dto.tools.filter((n) => !registry.has(n))
      if (unknown.length > 0) {
        throw new BadRequestException(`Tool không tồn tại: ${unknown.join(', ')}`)
      }
      const allow = new Set(dto.tools)
      tools = tools.filter((t) => allow.has(t.name))
    }

    const model = dto.model?.trim() || meta.defaultModel
    const maxTokens = dto.maxTokens ?? 2048
    const backend = this.buildBackend(meta.kind, meta.baseUrl, apiKey, model, maxTokens)

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
        provider: meta.id,
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
        provider: meta.id,
        turns: result.turns,
        stoppedReason: result.stoppedReason,
        toolCalls: result.toolCalls.map((t) => ({
          name: t.name,
          ok: t.ok,
          ms: t.ms,
          truncated: t.truncated,
          output: t.output,
        })),
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
          `API key ${meta.name} đã bị từ chối (có thể đã bị thu hồi). Hãy kết nối lại key mới.`,
          HttpStatus.BAD_GATEWAY,
        )
      }
      // Sanitize: thay key bằng [redacted] nếu chẳng may lọt vào message
      const safe = message.split(apiKey).join('[redacted]').slice(0, 500)
      throw new HttpException(
        `Agent chạy lỗi qua ${meta.name}: ${safe}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
  }
}
