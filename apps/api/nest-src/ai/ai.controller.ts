import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Session,
  Req,
  HttpCode,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AiService } from './ai.service'
import { ConnectAiDto, ChatDto } from './dto'
import { requireWorkspaceId } from '../common/session'
import type { Request } from 'express'

/**
 * AI Pro — kết nối API key các nền tảng AI của user và chat.
 *
 * GET    /ai/providers              → metadata public (không cần auth)
 * POST   /ai/connections            → validate + mã hóa + lưu key
 * GET    /ai/connections            → danh sách (không bao giờ trả key)
 * DELETE /ai/connections/:provider  → xóa key
 * POST   /ai/chat                   → chat qua provider đã kết nối
 */
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('providers')
  listProviders() {
    return this.aiService.listProviders()
  }

  @Post('connections')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // validate key gọi ra ngoài — siết riêng
  @HttpCode(200)
  async connect(
    @Body() dto: ConnectAiDto,
    @Session() session: any,
    @Req() req: Request,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.aiService.connect(workspaceId, dto, req.ip)
  }

  @Get('connections')
  async list(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.aiService.list(workspaceId)
  }

  @Delete('connections/:provider')
  async remove(
    @Param('provider') provider: string,
    @Session() session: any,
    @Req() req: Request,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.aiService.remove(workspaceId, provider, req.ip)
  }

  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // chat tốn tiền của user — giới hạn 20 req/phút
  @HttpCode(200)
  async chat(@Body() dto: ChatDto, @Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    return this.aiService.chat(workspaceId, dto, req.ip)
  }
}
