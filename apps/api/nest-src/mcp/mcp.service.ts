import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { VideoService } from '../video/video.service'
import { AiService } from '../ai/ai.service'

const WORKSPACE_ID = () => process.env.MCP_WORKSPACE_ID ?? ''
const MAX_TEXT = 8000

function textResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text: text.slice(0, MAX_TEXT) }],
    ...(isError ? { isError: true } : {}),
  }
}

/**
 * MCP server cho Kiemtien2026 — phục vụ agent Naive qua Streamable HTTP.
 * Mọi secret (workspace, key AI) nằm ở env phía server; agent không thấy gì.
 */
@Injectable()
export class McpService {
  constructor(
    private readonly video: VideoService,
    private readonly ai: AiService,
  ) {}

  buildServer(): McpServer {
    const server = new McpServer({ name: 'kiemtien2026', version: '1.0.0' })
    const workspaceId = WORKSPACE_ID()

    server.registerTool(
      'auto_build_video',
      {
        description:
          'Dựng project video từ nội dung nguồn: trả về brief, kịch bản, caption, ' +
          'hashtag và kết quả kiểm duyệt claim. Dùng sau khi đã có ý tưởng/kịch bản thô.',
        inputSchema: z.object({
          content: z.string().min(1).max(20000).describe('Nội dung nguồn (ý tưởng, kịch bản thô, brief)'),
        }),
      },
      async ({ content }) => {
        try {
          const project = await this.video.autoBuildFromSource(workspaceId, { content })
          return textResult(JSON.stringify(project, null, 2))
        } catch (e) {
          return textResult(`auto_build_video lỗi: ${e instanceof Error ? e.message : String(e)}`, true)
        }
      },
    )

    server.registerTool(
      'ai_chat',
      {
        description:
          'Hỏi AI miễn phí (provider utim, model claude-opus-5.5): viết lại caption, ' +
          'tối ưu kịch bản, brainstorm ý tưởng. Không tốn credit của agent.',
        inputSchema: z.object({
          message: z.string().min(1).max(20000).describe('Yêu cầu gửi tới AI'),
          model: z.string().max(100).optional().describe('Model UTIM (mặc định claude-opus-5.5)'),
        }),
      },
      async ({ message, model }) => {
        try {
          const res = await this.ai.chat(workspaceId, {
            provider: 'utim',
            model: model ?? 'claude-opus-5.5',
            maxTokens: 2000,
            messages: [{ role: 'user', content: message }],
          })
          const text =
            typeof res === 'string' ? res : JSON.stringify(res, null, 2)
          return textResult(text)
        } catch (e) {
          return textResult(`ai_chat lỗi: ${e instanceof Error ? e.message : String(e)}`, true)
        }
      },
    )

    return server
  }
}
