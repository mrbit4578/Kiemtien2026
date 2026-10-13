import { All, Controller, Req, Res, UseGuards } from '@nestjs/common'
import type { Request, Response } from 'express'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { McpService } from './mcp.service'
import { McpAuthGuard } from './mcp-auth.guard'

/**
 * Mount MCP server tại POST /mcp (Streamable HTTP, stateless).
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

  @All('/mcp')
  @UseGuards(McpAuthGuard)
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.nodeHandler(req, res, req.body)
  }
}
