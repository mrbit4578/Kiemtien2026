import { All, Controller, Param, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { timingSafeEqual } from 'crypto'
import { McpService } from './mcp.service'

/**
 * Mount MCP server tại POST /mcp/:secret (Streamable HTTP, stateless).
 * Xác thực bằng secret trong path (lấy từ env MCP_BEARER_TOKEN) — vì Naive
 * vault cần scope admin mà API key hiện tại không có, nên dùng path secret
 * thay cho Bearer token. Secret nằm trong URL cấu hình agent, agent không
 * thấy giá trị dưới dạng credential.
 * Client bắt buộc gửi: Content-Type: application/json
 * và Accept: application/json, text/event-stream
 */
@Controller()
export class McpController {
  private readonly nodeHandler: ReturnType<typeof toNodeHandler>

  constructor(mcp: McpService) {
    this.nodeHandler = toNodeHandler(
      createMcpHandler(() => mcp.buildServer()),
    )
  }

  @All('/mcp/:secret')
  async handle(
    @Param('secret') secret: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expected = process.env.MCP_BEARER_TOKEN ?? ''
    const ok =
      expected.length > 0 &&
      secret.length === expected.length &&
      timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    if (!ok) throw new UnauthorizedException('Invalid MCP secret')
    await this.nodeHandler(req, res, req.body)
  }
}
