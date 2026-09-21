import { Controller, Get, Res, Req, Session } from '@nestjs/common'
import type { Response, Request } from 'express'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { requireWorkspaceId } from '../common/session'

/**
 * Privacy endpoints — yêu cầu bởi GDPR và Nghị định 13/2023/NĐ-CP.
 * Export KHÔNG bao giờ chứa token (kể cả đã mã hóa).
 */
@Controller('privacy')
export class PrivacyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /** GET /privacy/export — xuất tất cả dữ liệu của workspace (JSON) */
  @Get('export')
  async export(@Session() session: any, @Req() req: Request, @Res() res: Response) {
    const workspaceId = requireWorkspaceId(session)

    const [connections, contentItems, jobs, auditLogs, workspace] = await Promise.all([
      this.prisma.connection.findMany({
        where: { workspaceId },
        select: {
          id: true,
          provider: true,
          providerUserId: true,
          status: true,
          scopesJson: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      this.prisma.contentItem.findMany({ where: { workspaceId } }),
      this.prisma.job.findMany({ where: { workspaceId } }),
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, plan: true, createdAt: true, ownerId: true },
      }),
    ])

    // Consents của owner + members (không lộ userId của người khác? giữ userId để đối chiếu)
    const memberIds = (
      await this.prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true },
      })
    ).map((m) => m.userId)
    const userIds = [...new Set([...memberIds, workspace?.ownerId].filter(Boolean) as string[])]
    const consents = await this.prisma.consent.findMany({
      where: { userId: { in: userIds } },
      select: {
        id: true,
        provider: true,
        purpose: true,
        scopesJson: true,
        policyVersion: true,
        grantedAt: true,
        revokedAt: true,
      },
    })

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'data_exported',
      entityType: 'workspace',
      targetId: workspaceId,
      result: 'success',
      ip: req.ip,
    })

    res.json({
      workspaceId,
      exportedAt: new Date().toISOString(),
      workspace,
      connections,
      contentItems,
      jobs,
      consents,
      auditLogs,
    })
  }
}
