import {
  Controller,
  Get,
  Post,
  Param,
  Session,
  Req,
  HttpCode,
  NotFoundException,
} from '@nestjs/common'
import type { Request } from 'express'
import type { Connection as SharedConnection, ConnectionStatus } from '@orh/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getConnector } from '../common/provider-registry'
import { requireWorkspaceId } from '../common/session'

type ConnectionRow = {
  id: string
  workspaceId: string
  provider: string
  providerUserId: string
  encryptedAccessToken: string
  encryptedRefreshToken: string | null
  expiresAt: Date
  scopesJson: string[]
  status: string
  lastError: string | null
  createdAt: Date
}

function toSharedConnection(row: ConnectionRow): SharedConnection {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider as SharedConnection['provider'],
    providerUserId: row.providerUserId,
    encryptedAccessToken: row.encryptedAccessToken,
    encryptedRefreshToken: row.encryptedRefreshToken ?? undefined,
    expiresAt: row.expiresAt,
    scopesJson: row.scopesJson,
    status: row.status as ConnectionStatus,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
  }
}

// KHÔNG bao giờ trả token (kể cả đã mã hóa) ra API
const SAFE_SELECT = {
  id: true,
  provider: true,
  providerUserId: true,
  status: true,
  scopesJson: true,
  expiresAt: true,
  lastError: true,
  createdAt: true,
} as const

@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /** GET /connections — danh sách connection của workspace (không trả token) */
  @Get()
  async list(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.prisma.connection.findMany({
      where: { workspaceId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  }

  /** GET /connections/:id — chi tiết 1 connection (không trả token) */
  @Get(':id')
  async getOne(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    const row = await this.prisma.connection.findFirst({
      where: { id, workspaceId },
      select: SAFE_SELECT,
    })
    if (!row) throw new NotFoundException('Không tìm thấy connection.')
    return row
  }

  /** POST /connections/:id/revoke — revoke token ở provider, xóa token trong DB, audit log */
  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(@Param('id') id: string, @Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    const row = await this.prisma.connection.findFirst({ where: { id, workspaceId } })
    if (!row) throw new NotFoundException('Không tìm thấy connection.')

    const connector = getConnector(row.provider)
    try {
      await connector.revoke(toSharedConnection(row))
    } catch {
      // best-effort: dù provider revoke lỗi, vẫn xóa token phía mình
    }

    await this.prisma.connection.update({
      where: { id },
      data: {
        status: 'revoked',
        encryptedAccessToken: '',
        encryptedRefreshToken: null,
        lastError: null,
      },
    })

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'connection_disconnected',
      provider: row.provider,
      entityType: 'connection',
      targetId: id,
      result: 'success',
      ip: req.ip,
    })

    return { revoked: true, id }
  }
}
