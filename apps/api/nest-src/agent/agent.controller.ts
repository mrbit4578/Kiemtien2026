import { Controller, Get, Post, Body, Session, Req, HttpCode } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AgentService } from './agent.service'
import { AgentRunDto } from './dto'
import { requireWorkspaceId } from '../common/session'
import type { Request } from 'express'

/**
 * AI Agent — chat có gọi tools (port kiến trúc runner của Strix).
 *
 * GET    /ai/agent/tools  → metadata tools khả dụng (không cần auth)
 * POST   /ai/agent/run    → chạy vòng lặp think→act→observe
 */
@Controller('ai/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('tools')
  listTools() {
    return this.agentService.listTools()
  }

  @Post('run')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // agent tốn nhiều token hơn chat — siết riêng
  @HttpCode(200)
  async run(@Body() dto: AgentRunDto, @Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    return this.agentService.run(workspaceId, dto, req.ip)
  }
}
