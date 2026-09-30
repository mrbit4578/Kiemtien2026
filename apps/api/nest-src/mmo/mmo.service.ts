import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  simulateAffiliateCommission,
  breakevenOrders,
  summarizeEconomics,
  isMonetizationModel,
  MONETIZATION_MODELS,
} from './mmo-economics'
import type { CreateOfferDto, UpdateOfferDto, UpsertEconomicsDto, SimulateAffiliateDto } from './dto'

const OFFER_STATUSES = ['candidate', 'active', 'paused', 'dropped'] as const

/**
 * MmoService — cơ chế thu nhập + đo lường hiệu quả video
 * (playbook mmo-ai-tiktok-roadmap-v1, chương 04/05).
 *
 * Nguyên tắc: chọn đề nghị mua TRƯỚC khi sản xuất; tiền chỉ tính từ sổ
 * quyết toán (commissionReceived), không suy từ lượt view.
 */
@Injectable()
export class MmoService {
  constructor(private readonly prisma: PrismaService) {}

  models() {
    return MONETIZATION_MODELS
  }

  // ─── Đề nghị mua ───

  async listOffers(workspaceId: string, filter: { projectId?: string; nicheSlug?: string }) {
    return this.prisma.monetizationOffer.findMany({
      where: {
        workspaceId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.nicheSlug ? { nicheSlug: filter.nicheSlug } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }

  async createOffer(workspaceId: string, dto: CreateOfferDto) {
    if (!isMonetizationModel(dto.model)) {
      throw new BadRequestException('model không hợp lệ.')
    }
    if (dto.projectId) {
      const p = await this.prisma.videoProject.findFirst({
        where: { id: dto.projectId, workspaceId },
      })
      if (!p) throw new NotFoundException('Không tìm thấy dự án video.')
    }
    return this.prisma.monetizationOffer.create({
      data: {
        workspaceId,
        projectId: dto.projectId || null,
        nicheSlug: dto.nicheSlug?.trim() || null,
        model: dto.model,
        title: dto.title.trim(),
        commissionAmount: dto.commissionAmount ?? null,
        commissionCurrency: dto.commissionCurrency?.trim() || 'VND',
        payoutTerms: dto.payoutTerms || null,
        verified: dto.verified ?? false,
        note: dto.note || null,
      },
    })
  }

  async updateOffer(workspaceId: string, id: string, dto: UpdateOfferDto) {
    const row = await this.prisma.monetizationOffer.findFirst({ where: { id, workspaceId } })
    if (!row) throw new NotFoundException('Không tìm thấy đề nghị mua.')
    if (dto.status && !(OFFER_STATUSES as readonly string[]).includes(dto.status)) {
      throw new BadRequestException('status không hợp lệ.')
    }
    return this.prisma.monetizationOffer.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.commissionAmount !== undefined ? { commissionAmount: dto.commissionAmount } : {}),
        ...(dto.payoutTerms !== undefined ? { payoutTerms: dto.payoutTerms } : {}),
        ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    })
  }

  async deleteOffer(workspaceId: string, id: string) {
    const row = await this.prisma.monetizationOffer.findFirst({ where: { id, workspaceId } })
    if (!row) throw new NotFoundException('Không tìm thấy đề nghị mua.')
    await this.prisma.monetizationOffer.delete({ where: { id } })
    return { ok: true }
  }

  // ─── Số liệu hiệu quả video ───

  private async requireProject(workspaceId: string, projectId: string) {
    const p = await this.prisma.videoProject.findFirst({ where: { id: projectId, workspaceId } })
    if (!p) throw new NotFoundException('Không tìm thấy dự án video.')
    return p
  }

  async getEconomics(workspaceId: string, projectId: string) {
    await this.requireProject(workspaceId, projectId)
    return this.prisma.videoEconomics.findUnique({ where: { projectId } })
  }

  async upsertEconomics(workspaceId: string, projectId: string, dto: UpsertEconomicsDto) {
    await this.requireProject(workspaceId, projectId)
    let postedAt: Date | null | undefined
    if (dto.postedAt !== undefined) {
      if (!dto.postedAt) {
        postedAt = null
      } else {
        const d = new Date(dto.postedAt)
        if (Number.isNaN(d.getTime())) throw new BadRequestException('postedAt không phải ngày hợp lệ.')
        postedAt = d
      }
    }
    const data = {
      ...(dto.costCash !== undefined ? { costCash: dto.costCash } : {}),
      ...(dto.hoursWorked !== undefined ? { hoursWorked: dto.hoursWorked } : {}),
      ...(dto.views !== undefined ? { views: dto.views } : {}),
      ...(dto.watchTimeSec !== undefined ? { watchTimeSec: dto.watchTimeSec } : {}),
      ...(dto.completionRate !== undefined ? { completionRate: dto.completionRate } : {}),
      ...(dto.saves !== undefined ? { saves: dto.saves } : {}),
      ...(dto.shares !== undefined ? { shares: dto.shares } : {}),
      ...(dto.clicks !== undefined ? { clicks: dto.clicks } : {}),
      ...(dto.orders !== undefined ? { orders: dto.orders } : {}),
      ...(dto.eligibleOrders !== undefined ? { eligibleOrders: dto.eligibleOrders } : {}),
      ...(dto.commissionReceived !== undefined ? { commissionReceived: dto.commissionReceived } : {}),
      ...(dto.organic !== undefined ? { organic: dto.organic } : {}),
      ...(postedAt !== undefined ? { postedAt } : {}),
      ...(dto.utm !== undefined ? { utm: dto.utm?.trim() || null } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    }
    return this.prisma.videoEconomics.upsert({
      where: { projectId },
      create: { projectId, workspaceId, ...data },
      update: data,
    })
  }

  /**
   * Tóm tắt hiệu quả: KPI gắn với tiền + điểm hòa vốn từ đề nghị mua
   * đã gắn với project (ưu tiên offer verified + active).
   */
  async economicsSummary(workspaceId: string, projectId: string) {
    const econ = await this.getEconomics(workspaceId, projectId)
    const offers = await this.listOffers(workspaceId, { projectId })
    const pick = offers.find((o: { verified: boolean; status: string }) => o.verified && o.status === 'active') ?? offers[0] ?? null
    const summary = econ
      ? summarizeEconomics({
          costCash: econ.costCash,
          hoursWorked: econ.hoursWorked,
          views: econ.views,
          clicks: econ.clicks,
          orders: econ.orders,
          eligibleOrders: econ.eligibleOrders,
          commissionReceived: econ.commissionReceived,
        })
      : null
    const costCash = econ?.costCash ?? 0
    const commissionPerOrder = pick?.commissionAmount ?? 0
    return {
      economics: econ,
      summary,
      offer: pick
        ? { id: pick.id, model: pick.model, title: pick.title, commissionAmount: pick.commissionAmount, verified: pick.verified }
        : null,
      breakevenOrders: breakevenOrders(costCash, commissionPerOrder),
      hasData: !!econ,
    }
  }

  /** Mô phỏng affiliate với số GIẢ ĐỊNH — chỉ để thấy điểm hòa vốn. */
  simulate(dto: SimulateAffiliateDto) {
    const sim = simulateAffiliateCommission({
      views: dto.views,
      clickThroughRate: dto.clickThroughRate,
      orderRateAfterClick: dto.orderRateAfterClick,
      eligibleRate: dto.eligibleRate,
      commissionPerOrder: dto.commissionPerOrder,
    })
    const costCash = dto.costCash ?? 0
    return {
      ...sim,
      costCash,
      profit: sim.commission - costCash,
      breakevenOrders: breakevenOrders(costCash, dto.commissionPerOrder),
      hypothetical: true, // cờ trung thực: số giả định, không phải dự báo
    }
  }
}
