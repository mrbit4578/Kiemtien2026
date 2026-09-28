import {
  Controller,
  Delete,
  Session,
  Req,
  HttpCode,
  NotFoundException,
} from '@nestjs/common'
import type { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getConnector } from '../common/provider-registry'
import { requireWorkspaceId } from '../common/session'

/**
 * DELETE /me/data — xóa tài khoản và dữ liệu.
 * Thực hiện: revoke token ở mọi provider (best-effort) → xóa token trong DB →
 * soft-delete user (deletedAt) → audit log. Hard delete sau 30 ngày (job riêng).
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Delete('data')
  @HttpCode(200)
  async deleteMyData(@Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) throw new NotFoundException('Không tìm thấy workspace.')

    // 1. Revoke tất cả token ở provider (best-effort, không gãy nếu provider lỗi)
    const connections = await this.prisma.connection.findMany({
      where: { workspaceId, status: 'active' },
    })
    for (const conn of connections) {
      try {
        await getConnector(conn.provider).revoke({
          id: conn.id,
          workspaceId: conn.workspaceId,
          provider: conn.provider as 'google',
          providerUserId: conn.providerUserId,
          encryptedAccessToken: conn.encryptedAccessToken,
          encryptedRefreshToken: conn.encryptedRefreshToken ?? undefined,
          expiresAt: conn.expiresAt,
          scopesJson: conn.scopesJson,
          status: 'active',
          createdAt: conn.createdAt,
        })
      } catch {
        // tiếp tục xóa phía mình dù provider revoke lỗi
      }
    }

    // 2. Xóa token trong DB, đánh dấu revoked
    await this.prisma.connection.updateMany({
      where: { workspaceId },
      data: {
        status: 'revoked',
        encryptedAccessToken: '',
        encryptedRefreshToken: null,
      },
    })

    // 3. Soft delete user (hard delete sau 30 ngày)
    await this.prisma.user.update({
      where: { id: workspace.ownerId },
      data: { deletedAt: new Date() },
    })

    // 4. Audit log sự kiện xóa
    await this.audit.log({
      workspaceId,
      actorId: workspace.ownerId,
      action: 'account_deleted',
      entityType: 'user',
      targetId: workspace.ownerId,
      result: 'success',
      ip: req.ip,
    })

    return { scheduled: true, message: 'Tài khoản đã được lên lịch xóa (soft delete, hard delete sau 30 ngày).' }
  }
}
