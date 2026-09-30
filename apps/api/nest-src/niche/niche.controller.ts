import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Session, HttpCode } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { NicheService } from './niche.service'
import { MarkNicheUsedDto, NicheFeedbackDto, MixNichesDto, ReplaceNicheDto, CreateNicheEvidenceDto } from './dto'
import { requireWorkspaceId } from '../common/session'

/**
 * Ngách đã dùng + thuật toán trộn + bảng ghi bằng chứng (playbook chương 01/02).
 *
 * GET    /niches/used        → slugs/labels đã dùng (để loại trừ khi quét)
 * POST   /niches/used        → đánh dấu đã dùng (không bao giờ đề xuất lại)
 * PATCH  /niches/used/:slug → ghi nhận kết quả (kaizen)
 * DELETE /niches/used/:slug → bỏ đánh dấu
 * POST   /niches/mix         → trộn + lọc danh sách AI đề xuất
 * POST   /niches/replace     → đánh dấu đã dùng + bổ sung 1 ngách mới tốt nhất
 * GET    /niches/evidence            → bảng ghi bằng chứng (?slug=…)
 * POST   /niches/evidence            → thêm dòng bằng chứng
 * DELETE /niches/evidence/:id        → xóa dòng bằng chứng
 * GET    /niches/evidence-score      → điểm bằng chứng 30/25/20/15/10 (?slugs=a,b)
 */
@Controller('niches')
export class NicheController {
  constructor(private readonly nicheService: NicheService) {}

  @Get('used')
  listUsed(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.listUsed(workspaceId)
  }

  @Post('used')
  @HttpCode(200)
  markUsed(@Body() dto: MarkNicheUsedDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.markUsed(workspaceId, dto)
  }

  @Patch('used/:slug')
  feedback(
    @Param('slug') slug: string,
    @Body() dto: NicheFeedbackDto,
    @Session() session: any,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.recordFeedback(workspaceId, slug, dto)
  }

  @Delete('used/:slug')
  unmark(@Param('slug') slug: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.unmark(workspaceId, slug)
  }

  // ─── Bảng ghi bằng chứng (playbook chương 01/02) ───

  @Get('evidence')
  listEvidence(@Query('slug') slug: string | undefined, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.listEvidence(workspaceId, slug)
  }

  @Post('evidence')
  @HttpCode(200)
  addEvidence(@Body() dto: CreateNicheEvidenceDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.addEvidence(workspaceId, dto)
  }

  @Delete('evidence/:id')
  deleteEvidence(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.deleteEvidence(workspaceId, id)
  }

  @Get('evidence-score')
  evidenceScore(@Query('slugs') slugs: string | undefined, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    const list = (slugs ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50)
    return this.nicheService.evidenceScoreDetail(workspaceId, list)
  }

  @Post('mix')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  mix(@Body() dto: MixNichesDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.mix(workspaceId, dto.candidates, {
      k: dto.k ?? 5,
      lambda: dto.lambda ?? 0.7,
      topicCap: dto.topicCap ?? 2,
    })
  }

  /**
   * POST /niches/replace — ngách được chọn thì đánh dấu đã dùng (không còn
   * là ưu tiên) và bổ sung ngay 1 ngách mới tốt nhất từ pool dự phòng.
   */
  @Post('replace')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  replace(@Body() dto: ReplaceNicheDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.nicheService.replace(
      workspaceId,
      {
        slug: dto.pickedSlug,
        label: dto.pickedLabel,
        category: dto.pickedCategory,
        score: dto.pickedScore,
        rationale: dto.pickedRationale,
      },
      dto.pool,
      dto.visibleSlugs,
    )
  }
}
