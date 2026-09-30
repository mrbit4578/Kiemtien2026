import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Session, HttpCode } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { MmoService } from './mmo.service'
import { CreateOfferDto, UpdateOfferDto, UpsertEconomicsDto, SimulateAffiliateDto } from './dto'
import { requireWorkspaceId } from '../common/session'

/**
 * MMO: cơ chế thu nhập + đo lường hiệu quả video
 * (playbook mmo-ai-tiktok-roadmap-v1, chương 04/05).
 *
 * GET    /mmo/models                    → 6 cơ chế thu nhập
 * GET    /mmo/offers                    → đề nghị mua (?projectId=, ?nicheSlug=)
 * POST   /mmo/offers                    → thêm đề nghị mua
 * PATCH  /mmo/offers/:id                → cập nhật (xác minh, trạng thái…)
 * DELETE /mmo/offers/:id                → xóa
 * GET    /mmo/economics/:projectId       → số liệu 1 video
 * PUT    /mmo/economics/:projectId       → upsert số liệu
 * GET    /mmo/economics/:projectId/summary → KPI + điểm hòa vốn
 * POST   /mmo/simulate                  → mô phỏng affiliate (số GIẢ ĐỊNH)
 */
@Controller('mmo')
export class MmoController {
  constructor(private readonly mmo: MmoService) {}

  @Get('models')
  models() {
    return this.mmo.models()
  }

  @Get('offers')
  listOffers(
    @Query('projectId') projectId: string | undefined,
    @Query('nicheSlug') nicheSlug: string | undefined,
    @Session() session: any,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.mmo.listOffers(workspaceId, { projectId, nicheSlug })
  }

  @Post('offers')
  @HttpCode(200)
  createOffer(@Body() dto: CreateOfferDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.mmo.createOffer(workspaceId, dto)
  }

  @Patch('offers/:id')
  updateOffer(@Param('id') id: string, @Body() dto: UpdateOfferDto, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.mmo.updateOffer(workspaceId, id, dto)
  }

  @Delete('offers/:id')
  deleteOffer(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.mmo.deleteOffer(workspaceId, id)
  }

  @Get('economics/:projectId')
  getEconomics(@Param('projectId') projectId: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.mmo.getEconomics(workspaceId, projectId)
  }

  @Put('economics/:projectId')
  upsertEconomics(
    @Param('projectId') projectId: string,
    @Body() dto: UpsertEconomicsDto,
    @Session() session: any,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.mmo.upsertEconomics(workspaceId, projectId, dto)
  }

  @Get('economics/:projectId/summary')
  economicsSummary(@Param('projectId') projectId: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.mmo.economicsSummary(workspaceId, projectId)
  }

  @Post('simulate')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  simulate(@Body() dto: SimulateAffiliateDto) {
    return this.mmo.simulate(dto)
  }
}
