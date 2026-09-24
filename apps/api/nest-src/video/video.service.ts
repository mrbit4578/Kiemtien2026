import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { GATE_IDS, VIDEO_STAGES } from './dto'
import type {
  CreateVideoProjectDto,
  UpdateVideoProjectDto,
  CreateVideoAssetDto,
  CreateVideoClaimDto,
  CreateVideoAiEntryDto,
  RiskScoreDto,
} from './dto'

export interface RiskResult {
  score: number
  breakdown: { c: number; p: number; l: number; a: number; m: number; h: number }
  decision: string
  veto: string | null
}

/**
 * VideoService — quản lý dự án video faceless: pipeline 10 bước, 3 ledgers
 * (rights/claims/AI register), 8 cổng QA, risk score.
 * Spec: docs/faceless-video-system.md
 */
@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private async requireProject(workspaceId: string, id: string) {
    const project = await this.prisma.videoProject.findFirst({
      where: { id, workspaceId },
    })
    if (!project) throw new NotFoundException('Không tìm thấy dự án video.')
    return project
  }

  // ─── Projects ───

  async listProjects(workspaceId: string) {
    const projects = await this.prisma.videoProject.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { assets: true, claims: true, aiEntries: true } },
      },
    })
    return projects.map((p) => ({
      id: p.id,
      title: p.title,
      series: p.series,
      stage: p.stage,
      riskScore: p.riskScore,
      assetCount: p._count.assets,
      claimCount: p._count.claims,
      aiEntryCount: p._count.aiEntries,
      contentItemId: p.contentItemId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))
  }

  async createProject(workspaceId: string, dto: CreateVideoProjectDto) {
    return this.prisma.videoProject.create({
      data: {
        workspaceId,
        title: dto.title.trim(),
        series: dto.series?.trim() || null,
        viralSourceUrl: dto.viralSourceUrl?.trim() || null,
        stage: 'intake',
      },
    })
  }

  async getProject(workspaceId: string, id: string) {
    const project = await this.requireProject(workspaceId, id)
    const [assets, claims, aiEntries] = await Promise.all([
      this.prisma.videoAsset.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.videoClaim.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.videoAiEntry.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } }),
    ])
    return { ...project, assets, claims, aiEntries }
  }

  async updateProject(workspaceId: string, id: string, dto: UpdateVideoProjectDto) {
    await this.requireProject(workspaceId, id)
    if (dto.stage && !VIDEO_STAGES.includes(dto.stage as (typeof VIDEO_STAGES)[number])) {
      throw new BadRequestException('stage không hợp lệ.')
    }
    return this.prisma.videoProject.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.series !== undefined ? { series: dto.series?.trim() || null } : {}),
        ...(dto.viralSourceUrl !== undefined ? { viralSourceUrl: dto.viralSourceUrl?.trim() || null } : {}),
        ...(dto.sourceNote !== undefined ? { sourceNote: dto.sourceNote } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.angle !== undefined ? { angle: dto.angle } : {}),
        ...(dto.briefJson !== undefined ? { briefJson: dto.briefJson } : {}),
        ...(dto.script !== undefined ? { script: dto.script } : {}),
        ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
        ...(dto.publishNotes !== undefined ? { publishNotes: dto.publishNotes } : {}),
        ...(dto.contentItemId !== undefined ? { contentItemId: dto.contentItemId || null } : {}),
      },
    })
  }

  async deleteProject(workspaceId: string, id: string, ip?: string) {
    const project = await this.requireProject(workspaceId, id)
    await this.prisma.videoProject.delete({ where: { id } })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'video_project_delete',
      entityType: 'video_project',
      targetId: id,
      result: 'success',
      metadata: { title: project.title },
      ip,
    })
    return { ok: true }
  }

  // ─── Gates G1–G8 ───

  async updateGates(workspaceId: string, id: string, gates: Record<string, { pass: boolean; note?: string }>) {
    await this.requireProject(workspaceId, id)
    for (const key of Object.keys(gates)) {
      if (!GATE_IDS.includes(key as (typeof GATE_IDS)[number])) {
        throw new BadRequestException(`Gate không hợp lệ: ${key}`)
      }
    }
    const project = await this.prisma.videoProject.update({
      where: { id },
      data: { gatesJson: JSON.stringify(gates) },
    })
    return { ok: true, gatesJson: project.gatesJson }
  }

  // ─── Risk score ───

  computeRisk(dto: RiskScoreDto): RiskResult {
    const breakdown = { c: dto.c, p: dto.p, l: dto.l, a: dto.a, m: dto.m, h: dto.h }
    const score = dto.c + dto.p + dto.l + dto.a + dto.m + dto.h

    let veto: string | null = null
    if (dto.a4NoConsent) {
      veto = 'REJECT: mô phỏng người thật (A4) nhưng không có consent văn bản.'
    } else if (dto.criticalHealthClaimUnverified) {
      veto = 'REJECT: claim sức khỏe/tài chính mức critical chưa được xác minh.'
    }

    let decision: string
    if (veto) {
      decision = veto
    } else if (score <= 3) {
      decision = 'Tiếp tục — self-review theo checklist.'
    } else if (score <= 7) {
      decision = 'Dừng 1 ngày, bổ sung nguồn/license rồi review lại.'
    } else if (score <= 11) {
      decision = 'Viết lại / bỏ asset / xin permission trước khi tiếp tục.'
    } else {
      decision = 'Reject — chuyển thành nội dung giáo dục khái quát, không dùng claim/person/source asset.'
    }
    return { score, breakdown, decision, veto }
  }

  async saveRiskScore(workspaceId: string, id: string, dto: RiskScoreDto) {
    await this.requireProject(workspaceId, id)
    const result = this.computeRisk(dto)
    await this.prisma.videoProject.update({
      where: { id },
      data: { riskScore: result.score, riskBreakdown: JSON.stringify(result.breakdown) },
    })
    return result
  }

  // ─── Rights ledger ───

  async addAsset(workspaceId: string, projectId: string, dto: CreateVideoAssetDto) {
    await this.requireProject(workspaceId, projectId)
    return this.prisma.videoAsset.create({
      data: {
        projectId,
        name: dto.name.trim(),
        assetType: dto.assetType,
        sourceUrl: dto.sourceUrl?.trim() || null,
        owner: dto.owner?.trim() || null,
        rightsBasis: dto.rightsBasis,
        scope: dto.scope?.trim() || null,
        proof: dto.proof || null,
        status: dto.status ?? 'pending',
      },
    })
  }

  async deleteAsset(workspaceId: string, projectId: string, assetId: string) {
    await this.requireProject(workspaceId, projectId)
    const asset = await this.prisma.videoAsset.findFirst({ where: { id: assetId, projectId } })
    if (!asset) throw new NotFoundException('Không tìm thấy asset.')
    await this.prisma.videoAsset.delete({ where: { id: assetId } })
    return { ok: true }
  }

  async setAssetStatus(workspaceId: string, projectId: string, assetId: string, status: string) {
    await this.requireProject(workspaceId, projectId)
    if (!['cleared', 'conditional', 'pending', 'reject'].includes(status)) {
      throw new BadRequestException('status không hợp lệ.')
    }
    const asset = await this.prisma.videoAsset.findFirst({ where: { id: assetId, projectId } })
    if (!asset) throw new NotFoundException('Không tìm thấy asset.')
    return this.prisma.videoAsset.update({ where: { id: assetId }, data: { status } })
  }

  /** Kiểm tra publish-readiness: asset nào chưa cleared thì chặn. */
  async checkPublishReadiness(workspaceId: string, id: string) {
    await this.requireProject(workspaceId, id)
    const assets = await this.prisma.videoAsset.findMany({ where: { projectId: id } })
    const blocking = assets.filter((a) => a.status !== 'cleared')
    const claims = await this.prisma.videoClaim.findMany({ where: { projectId: id } })
    const riskyClaims = claims.filter(
      (c) => c.confidence === 'unverified' && ['high', 'critical'].includes(c.riskLevel) && c.status === 'open',
    )
    return {
      ready: blocking.length === 0 && riskyClaims.length === 0,
      blockingAssets: blocking.map((a) => ({ id: a.id, name: a.name, status: a.status })),
      riskyClaims: riskyClaims.map((c) => ({ id: c.id, claimText: c.claimText.slice(0, 120) })),
    }
  }

  // ─── Claim ledger ───

  async addClaim(workspaceId: string, projectId: string, dto: CreateVideoClaimDto) {
    await this.requireProject(workspaceId, projectId)
    return this.prisma.videoClaim.create({
      data: {
        projectId,
        claimText: dto.claimText.trim(),
        claimType: dto.claimType,
        riskLevel: dto.riskLevel,
        primarySource: dto.primarySource || null,
        secondarySource: dto.secondarySource || null,
        confidence: dto.confidence,
        status: dto.status ?? 'open',
      },
    })
  }

  async deleteClaim(workspaceId: string, projectId: string, claimId: string) {
    await this.requireProject(workspaceId, projectId)
    const claim = await this.prisma.videoClaim.findFirst({ where: { id: claimId, projectId } })
    if (!claim) throw new NotFoundException('Không tìm thấy claim.')
    await this.prisma.videoClaim.delete({ where: { id: claimId } })
    return { ok: true }
  }

  async setClaimStatus(workspaceId: string, projectId: string, claimId: string, status: string) {
    await this.requireProject(workspaceId, projectId)
    if (!['open', 'corrected', 'withdrawn'].includes(status)) {
      throw new BadRequestException('status không hợp lệ.')
    }
    const claim = await this.prisma.videoClaim.findFirst({ where: { id: claimId, projectId } })
    if (!claim) throw new NotFoundException('Không tìm thấy claim.')
    return this.prisma.videoClaim.update({ where: { id: claimId }, data: { status } })
  }

  // ─── AI register ───

  async addAiEntry(workspaceId: string, projectId: string, dto: CreateVideoAiEntryDto) {
    await this.requireProject(workspaceId, projectId)
    if (dto.category === 'A4' && dto.realPerson && dto.consentStatus !== 'obtained') {
      throw new BadRequestException(
        'A4 mô phỏng người thật nhưng chưa có consent — mặc định REJECT. Hãy xin consent văn bản trước.',
      )
    }
    return this.prisma.videoAiEntry.create({
      data: {
        projectId,
        assetName: dto.assetName.trim(),
        tool: dto.tool.trim(),
        inputSource: dto.inputSource || null,
        outputUse: dto.outputUse || null,
        category: dto.category,
        realPerson: dto.realPerson ?? false,
        labelRequired: dto.labelRequired ?? (dto.category === 'A3' || dto.category === 'A4'),
        labelApplied: dto.labelApplied ?? false,
        consentStatus: dto.consentStatus ?? null,
      },
    })
  }

  async deleteAiEntry(workspaceId: string, projectId: string, entryId: string) {
    await this.requireProject(workspaceId, projectId)
    const entry = await this.prisma.videoAiEntry.findFirst({ where: { id: entryId, projectId } })
    if (!entry) throw new NotFoundException('Không tìm thấy mục AI.')
    await this.prisma.videoAiEntry.delete({ where: { id: entryId } })
    return { ok: true }
  }

  async setAiLabel(workspaceId: string, projectId: string, entryId: string, applied: boolean) {
    await this.requireProject(workspaceId, projectId)
    const entry = await this.prisma.videoAiEntry.findFirst({ where: { id: entryId, projectId } })
    if (!entry) throw new NotFoundException('Không tìm thấy mục AI.')
    return this.prisma.videoAiEntry.update({ where: { id: entryId }, data: { labelApplied: applied } })
  }

  // ─── Gửi sang Content Studio ───

  /**
   * Tạo ContentItem draft từ caption của project để đi vào pipeline publish
   * (TikTok/Instagram/Facebook) có sẵn. Chặn nếu còn asset chưa cleared hoặc
   * claim rủi ro cao chưa xác minh.
   */
  async sendToContentStudio(workspaceId: string, id: string, ip?: string) {
    const project = await this.requireProject(workspaceId, id)
    const readiness = await this.checkPublishReadiness(workspaceId, id)
    if (!readiness.ready) {
      throw new BadRequestException(
        `Chưa đủ điều kiện xuất bản: ${readiness.blockingAssets.length} asset chưa cleared, ` +
          `${readiness.riskyClaims.length} claim rủi ro cao chưa xác minh.`,
      )
    }
    if (!project.caption?.trim()) {
      throw new BadRequestException('Project chưa có caption — hãy chốt kịch bản trước.')
    }
    const item = await this.prisma.contentItem.create({
      data: {
        workspaceId,
        caption: project.caption.trim(),
        status: 'draft',
        approvalStatus: 'pending',
      },
    })
    await this.prisma.videoProject.update({ where: { id }, data: { contentItemId: item.id } })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'video_project_to_content_studio',
      entityType: 'video_project',
      targetId: id,
      result: 'success',
      metadata: { contentItemId: item.id },
      ip,
    })
    return { ok: true, contentItemId: item.id }
  }
}
