import { Controller, Get, Session } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { requireWorkspaceId } from '../common/session'

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    const [totalConnections, totalPublished, totalFailed] = await Promise.all([
      this.prisma.connection.count({ where: { workspaceId, status: 'active' } }),
      this.prisma.job.count({ where: { workspaceId, status: 'done' } }),
      this.prisma.job.count({
        where: { workspaceId, status: { in: ['failed', 'dead_letter'] } },
      }),
    ])
    return {
      totalConnections,
      totalPublished,
      totalFailed,
      lastUpdated: new Date().toISOString(),
    }
  }
}
