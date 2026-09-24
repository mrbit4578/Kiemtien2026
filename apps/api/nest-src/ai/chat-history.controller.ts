import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Session,
  Req,
  HttpCode,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ChatHistoryService } from './chat-history.service'
import { CreateChatSessionDto, AppendChatMessagesDto, RenameChatSessionDto } from './dto'
import { requireWorkspaceId } from '../common/session'
import type { Request } from 'express'

/**
 * Nhật ký chat AI Pro — lưu lịch sử và xóa tùy ý.
 *
 * GET    /ai/chat/sessions                        → danh sách phiên
 * POST   /ai/chat/sessions                        → tạo phiên mới
 * DELETE /ai/chat/sessions                        → xóa TOÀN BỘ lịch sử
 * GET    /ai/chat/sessions/:id                    → chi tiết + tin nhắn
 * PATCH  /ai/chat/sessions/:id                    → đổi tiêu đề
 * DELETE /ai/chat/sessions/:id                    → xóa 1 phiên
 * POST   /ai/chat/sessions/:id/messages           → lưu thêm tin nhắn
 * DELETE /ai/chat/sessions/:id/messages/:messageId → xóa 1 tin nhắn
 */
@Controller('ai/chat')
export class ChatHistoryController {
  constructor(private readonly history: ChatHistoryService) {}

  @Get('sessions')
  async list(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.listSessions(workspaceId)
  }

  @Post('sessions')
  @HttpCode(200)
  async create(@Body() dto: CreateChatSessionDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.createSession(workspaceId, dto)
  }

  @Delete('sessions')
  async clearAll(@Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.clearAll(workspaceId, req.ip)
  }

  @Get('sessions/:id')
  async get(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.getSession(workspaceId, id)
  }

  @Patch('sessions/:id')
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameChatSessionDto,
    @Session() session: any,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.renameSession(workspaceId, id, dto.title)
  }

  @Delete('sessions/:id')
  async remove(@Param('id') id: string, @Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.deleteSession(workspaceId, id, req.ip)
  }

  @Post('sessions/:id/messages')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(200)
  async append(
    @Param('id') id: string,
    @Body() dto: AppendChatMessagesDto,
    @Session() session: any,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.appendMessages(workspaceId, id, dto.messages)
  }

  @Delete('sessions/:id/messages/:messageId')
  async deleteMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Session() session: any,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.history.deleteMessage(workspaceId, id, messageId)
  }
}
