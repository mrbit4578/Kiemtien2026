import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Session,
  Req,
  HttpCode,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common'
import {
  IsString,
  IsOptional,
  IsUrl,
  IsDateString,
  IsBoolean,
  MaxLength,
} from 'class-validator'
import type { Request } from 'express'
import { Prisma, PrismaClient } from '@prisma/client'
import { OrhError } from '@orh/shared'
import type { Provider } from '@orh/shared'
import { isConsentRequired } from '@orh/policy'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { requireWorkspaceId } from '../common/session'

/**
 * Luồng content:
 * 1. Tạo content item (draft)
 * 2. Manager approve (approvalStatus = approved)
 * 3. Publish → kiểm tra consent + approval, tạo Job với idempotency key
 *    (KHÔNG publish trực tiếp — PublishWorkerService poll và xử lý)
 */

class CreateContentDto {
  @IsString()
  @MaxLength(2200)
  caption!: string

  @IsOptional()
  @IsUrl()
  assetUrl?: string

  @IsOptional()
  @IsDateString()
  scheduledAt?: string
}

class ApproveContentDto {
  @IsBoolean()
  approved!: boolean

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}

class PublishContentDto {
  @IsString()
  connectionId!: string
}

class UpdateScheduleDto {
  /** ISO datetime string; null = xóa lịch (đăng ngay); undefined = không đổi */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null
}

/**
 * Guard: consent PHẢI tồn tại và còn hiệu lực trước khi gọi API provider.
 * Ném OrhError CONSENT_REQUIRED nếu chưa đủ consent.
 */
async function assertConsent(
  prisma: PrismaClient,
  provider: string,
  scopes: string[],
): Promise<void> {
  const latest = await prisma.consent.findFirst({
    where: { provider, revokedAt: null },
    orderBy: { grantedAt: 'desc' },
  })
  const existing = latest
    ? { ...latest, provider: latest.provider as Provider, revokedAt: latest.revokedAt ?? undefined }
    : undefined
  if (isConsentRequired(existing, scopes)) {
    throw new OrhError(
      'CONSENT_REQUIRED',
      `Chưa có consent hợp lệ cho ${provider}. Hãy kết nối lại tài khoản.`,
      false,
      provider,
    )
  }
}

@Controller('content')
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /** POST /content — tạo content item mới (draft) */
  @Post()
  async create(@Body() dto: CreateContentDto, @Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    const item = await this.prisma.contentItem.create({
      data: {
        workspaceId,
        caption: dto.caption,
        assetUrl: dto.assetUrl,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: 'draft',
        approvalStatus: 'pending',
      },
    })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'content_created',
      entityType: 'content',
      targetId: item.id,
      result: 'success',
      ip: req.ip,
    })
    return item
  }

  /** GET /content — danh sách content của workspace */
  @Get()
  async list(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.prisma.contentItem.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** GET /content/:id — chi tiết content */
  @Get(':id')
  async getOne(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    const item = await this.prisma.contentItem.findFirst({ where: { id, workspaceId } })
    if (!item) throw new NotFoundException('Không tìm thấy content.')
    return item
  }

  /** POST /content/:id/approve — approve/reject để đủ điều kiện publish */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveContentDto,
    @Session() session: any,
    @Req() req: Request,
  ) {
    const workspaceId = requireWorkspaceId(session)
    const item = await this.prisma.contentItem.findFirst({ where: { id, workspaceId } })
    if (!item) throw new NotFoundException('Không tìm thấy content.')
    if (item.status === 'published') {
      throw new BadRequestException('Content đã publish, không thể đổi approval.')
    }

    const updated = await this.prisma.contentItem.update({
      where: { id },
      data: dto.approved
        ? { approvalStatus: 'approved', status: 'approved' }
        : { approvalStatus: 'rejected', status: 'draft' },
    })

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: dto.approved ? 'content_approved' : 'content_rejected',
      entityType: 'content',
      targetId: id,
      result: 'success',
      metadata: dto.note ? { note: dto.note } : undefined,
      ip: req.ip,
    })

    return updated
  }

  /** POST /content/:id/publish — kiểm tra approval + consent, tạo Job idempotent */
  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @Param('id') id: string,
    @Body() dto: PublishContentDto,
    @Session() session: any,
    @Req() req: Request,
  ) {
    const workspaceId = requireWorkspaceId(session)
    const item = await this.prisma.contentItem.findFirst({ where: { id, workspaceId } })
    if (!item) throw new NotFoundException('Không tìm thấy content.')

    // Guard 1: content PHẢI được approve trước khi publish
    if (item.approvalStatus !== 'approved') {
      throw new BadRequestException('Content chưa được approve, không thể publish.')
    }

    const connection = await this.prisma.connection.findFirst({
      where: { id: dto.connectionId, workspaceId },
    })
    if (!connection) throw new NotFoundException('Không tìm thấy connection.')
    if (connection.status !== 'active') {
      throw new BadRequestException(`Connection đang ở trạng thái ${connection.status}.`)
    }

    // Guard 2: consent PHẢI tồn tại trước khi gọi API provider
    try {
      await assertConsent(this.prisma, connection.provider, connection.scopesJson)
    } catch (err) {
      if (err instanceof OrhError && err.code === 'CONSENT_REQUIRED') {
        throw new ForbiddenException(err.message)
      }
      throw err
    }

    // Idempotency: 1 content + 1 connection chỉ có 1 job publish
    const idempotencyKey = `publish:${item.id}:${connection.id}`
    try {
      const job = await this.prisma.job.create({
        data: {
          connectionId: connection.id,
          contentItemId: item.id,
          idempotencyKey,
          workspaceId,
          status: 'pending',
          nextRunAt: item.scheduledAt,
        },
      })

      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'content_publish_queued',
        provider: connection.provider,
        entityType: 'job',
        targetId: job.id,
        result: 'success',
        metadata: { contentId: item.id, connectionId: connection.id },
        ip: req.ip,
      })

      return { id: item.id, queued: true, jobId: job.id }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Job publish đã tồn tại (idempotency).')
      }
      throw err
    }
  }

  /**
   * POST /content/:id/retry-publish — thử lại job publish đã thất bại.
   * Chỉ áp dụng cho job ở trạng thái cuối 'failed' | 'dead_letter'; đưa về
   * 'pending' để PublishWorkerService xử lý lại (giữ nguyên idempotency key nên
   * không tạo job trùng).
   */
  @Post(':id/retry-publish')
  @HttpCode(200)
  async retryPublish(@Param('id') id: string, @Body() dto: PublishContentDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    const item = await this.prisma.contentItem.findFirst({ where: { id, workspaceId } })
    if (!item) throw new NotFoundException('Không tìm thấy content.')
    const connection = await this.prisma.connection.findFirst({
      where: { id: dto.connectionId, workspaceId },
    })
    if (!connection) throw new NotFoundException('Không tìm thấy connection.')

    const idempotencyKey = `publish:${item.id}:${connection.id}`
    const job = await this.prisma.job.findUnique({ where: { idempotencyKey } })
    if (!job) throw new NotFoundException('Chưa có job publish cho content này.')
    if (job.status !== 'failed' && job.status !== 'dead_letter') {
      throw new BadRequestException(`Job đang ở trạng thái ${job.status}, không cần thử lại.`)
    }
    const updated = await this.prisma.job.update({
      where: { id: job.id },
      data: { status: 'pending', nextRunAt: null, lastError: null },
    })
    await this.prisma.contentItem.update({
      where: { id: item.id },
      data: { status: 'approved' },
    })
    return { id: item.id, jobId: updated.id, queued: true }
  }

  /**
   * PATCH /content/:id/schedule — đổi lịch đăng của content.
   * - scheduledAt = ISO string → dời lịch sang giờ mới
   * - scheduledAt = null → xóa lịch (đăng ngay khi đẩy queue)
   * - không truyền scheduledAt → không đổi
   * Job publish đang 'pending' của content này cũng được cập nhật nextRunAt
   * theo để worker xử lý đúng giờ mới. Không áp dụng cho content đã published.
   */
  @Patch(':id/schedule')
  @HttpCode(200)
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @Session() session: any,
    @Req() req: Request,
  ) {
    const workspaceId = requireWorkspaceId(session)
    const item = await this.prisma.contentItem.findFirst({ where: { id, workspaceId } })
    if (!item) throw new NotFoundException('Không tìm thấy content.')
    if (item.status === 'published') {
      throw new BadRequestException('Content đã xuất bản, không thể đổi lịch.')
    }
    if (!('scheduledAt' in dto)) {
      return item
    }
    const nextRunAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null
    const updated = await this.prisma.contentItem.update({
      where: { id: item.id },
      data: { scheduledAt: nextRunAt },
    })
    // Đồng bộ job đang chờ: nếu đã có job pending thì đổi nextRunAt theo,
    // để "xóa lịch" có tác dụng ngay cả khi job đã được tạo trước đó.
    await this.prisma.job.updateMany({
      where: { contentItemId: item.id, status: 'pending' },
      data: { nextRunAt },
    })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'content_schedule_updated',
      entityType: 'content',
      targetId: item.id,
      result: 'success',
      ip: req.ip,
    })
    return updated
  }
}
