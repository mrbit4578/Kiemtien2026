import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getProviderMeta } from './ai.providers'
import {
  DEFAULT_SESSION_TITLE,
  type CreateChatSessionDto,
  type ChatHistoryMessageDto,
} from './dto'

const TITLE_MAX = 60

/**
 * ChatHistoryService — nhật ký chat AI Pro.
 * - Mỗi workspace có nhiều phiên chat (ChatSession), mỗi phiên có nhiều tin nhắn.
 * - Tiêu đề phiên tự sinh từ tin nhắn user đầu tiên nếu user không đặt.
 * - Mọi method đều kiểm tra session thuộc đúng workspace (không lộ sự tồn tại).
 * - metaJson chỉ chứa metadata hiển thị — KHÔNG bao giờ chứa API key.
 */
@Injectable()
export class ChatHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /** Lấy session và chắc chắn nó thuộc workspace — ngược lại 404. */
  private async requireSession(workspaceId: string, id: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id, workspaceId },
    })
    if (!session) throw new NotFoundException('Không tìm thấy đoạn chat.')
    return session
  }

  private autoTitle(content: string): string {
    const oneLine = content.replace(/\s+/g, ' ').trim()
    return oneLine.length > TITLE_MAX ? oneLine.slice(0, TITLE_MAX) + '…' : oneLine || DEFAULT_SESSION_TITLE
  }

  /** GET /ai/chat/sessions — danh sách phiên, mới nhất trước, kèm preview. */
  async listSessions(workspaceId: string) {
    const sessions = await this.prisma.chatSession.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    return sessions.map((s) => ({
      id: s.id,
      provider: s.provider,
      providerName: getProviderMeta(s.provider)?.name ?? s.provider,
      model: s.model,
      mode: s.mode,
      title: s.title,
      messageCount: s._count.messages,
      preview: s.messages[0]?.content.slice(0, 120) ?? '',
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
  }

  /** POST /ai/chat/sessions — tạo phiên mới. */
  async createSession(workspaceId: string, dto: CreateChatSessionDto) {
    const session = await this.prisma.chatSession.create({
      data: {
        workspaceId,
        provider: dto.provider,
        model: dto.model ?? getProviderMeta(dto.provider)?.defaultModel ?? null,
        mode: dto.mode ?? 'chat',
        title: dto.title?.trim() || DEFAULT_SESSION_TITLE,
      },
    })
    return this.toSessionDto(session, 0, '')
  }

  /** GET /ai/chat/sessions/:id — chi tiết phiên kèm toàn bộ tin nhắn. */
  async getSession(workspaceId: string, id: string) {
    const session = await this.requireSession(workspaceId, id)
    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    })
    return {
      ...this.toSessionDto(session, messages.length, ''),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        meta: m.metaJson ? (JSON.parse(m.metaJson) as Record<string, unknown>) : undefined,
        createdAt: m.createdAt,
      })),
    }
  }

  /**
   * POST /ai/chat/sessions/:id/messages — lưu thêm tin nhắn.
   * Nếu tiêu đề vẫn là mặc định, tự đặt theo tin nhắn user đầu tiên.
   * Trả về tin nhắn đã lưu (kèm id) để frontend gắn vào state.
   */
  async appendMessages(
    workspaceId: string,
    sessionId: string,
    messages: ChatHistoryMessageDto[],
  ) {
    const session = await this.requireSession(workspaceId, sessionId)

    const created: Array<{ id: string; role: string; createdAt: Date }> = []
    for (const m of messages) {
      const rec = await this.prisma.chatMessage.create({
        data: {
          sessionId,
          role: m.role,
          content: m.content,
          metaJson: m.meta ? JSON.stringify(m.meta) : null,
        },
      })
      created.push({ id: rec.id, role: rec.role, createdAt: rec.createdAt })
    }

    let title = session.title
    if (title === DEFAULT_SESSION_TITLE) {
      const firstUser = messages.find((m) => m.role === 'user')
      if (firstUser) title = this.autoTitle(firstUser.content)
    }

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { title, updatedAt: new Date() },
    })
    return { ok: true, title, messages: created }
  }

  /** PATCH /ai/chat/sessions/:id — đổi tiêu đề. */
  async renameSession(workspaceId: string, id: string, title: string) {
    await this.requireSession(workspaceId, id)
    const trimmed = title.trim()
    if (!trimmed) throw new BadRequestException('Tiêu đề không được rỗng.')
    const session = await this.prisma.chatSession.update({
      where: { id },
      data: { title: trimmed.slice(0, 120) },
    })
    return this.toSessionDto(session, 0, '')
  }

  /** DELETE /ai/chat/sessions/:id — xóa 1 phiên (tin nhắn xóa theo nhờ onDelete Cascade). */
  async deleteSession(workspaceId: string, id: string, ip?: string) {
    const session = await this.requireSession(workspaceId, id)
    const { count } = await this.prisma.chatMessage.deleteMany({ where: { sessionId: id } })
    await this.prisma.chatSession.delete({ where: { id } })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'chat_session_delete',
      entityType: 'chat_session',
      targetId: id,
      result: 'success',
      metadata: { title: session.title, messageCount: count },
      ip,
    })
    return { ok: true }
  }

  /** DELETE /ai/chat/sessions/:id/messages/:messageId — xóa 1 tin nhắn. */
  async deleteMessage(workspaceId: string, sessionId: string, messageId: string) {
    await this.requireSession(workspaceId, sessionId)
    const msg = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, sessionId },
    })
    if (!msg) throw new NotFoundException('Không tìm thấy tin nhắn.')
    await this.prisma.chatMessage.delete({ where: { id: messageId } })
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    })
    return { ok: true }
  }

  /** DELETE /ai/chat/sessions — xóa TOÀN BỘ lịch sử chat của workspace. */
  async clearAll(workspaceId: string, ip?: string) {
    const sessions = await this.prisma.chatSession.findMany({
      where: { workspaceId },
      select: { id: true },
    })
    const ids = sessions.map((s) => s.id)
    let messageCount = 0
    if (ids.length > 0) {
      const del = await this.prisma.chatMessage.deleteMany({ where: { sessionId: { in: ids } } })
      messageCount = del.count
      await this.prisma.chatSession.deleteMany({ where: { workspaceId } })
    }
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'chat_history_clear_all',
      entityType: 'chat_session',
      result: 'success',
      metadata: { sessionCount: ids.length, messageCount },
      ip,
    })
    return { ok: true, deletedSessions: ids.length, deletedMessages: messageCount }
  }

  private toSessionDto(
    s: { id: string; provider: string; model: string | null; mode: string; title: string; createdAt: Date; updatedAt: Date },
    messageCount: number,
    preview: string,
  ) {
    return {
      id: s.id,
      provider: s.provider,
      providerName: getProviderMeta(s.provider)?.name ?? s.provider,
      model: s.model,
      mode: s.mode,
      title: s.title,
      messageCount,
      preview,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }
  }
}
