import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { AiService, FALLBACK_PRIORITY } from '../ai/ai.service'
import { getProviderMeta, type AiProviderId } from '../ai/ai.providers'
import { videoBriefTool, videoScriptTool } from '../agent/video-tools'
import { GATE_IDS, VIDEO_STAGES } from './dto'
import type {
  AutoBuildVideoDto,
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
    private readonly ai: AiService,
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

  // ─── Auto-build từ nội dung nguồn ───

  private static readonly AUTO_BUILD_SYSTEM = `Bạn là trợ lý dựng video faceless của Kiemtien2026. Nhiệm vụ: đọc nội dung nguồn người dùng đưa và TRẢ VỀ DUY NHẤT một JSON hợp lệ (không markdown, không giải thích), đúng schema sau:

{
  "topic": "chủ đề rút ra từ tín hiệu viral (vấn đề/nhu cầu khán giả)",
  "source_analysis": "phân tích nguồn: hook, claim chính, format, phản ứng khán giả. KHÔNG copy câu chữ nguồn",
  "angles": ["góc mới 1 (1 câu)", "góc mới 2 (1 câu)", "góc mới 3 (1 câu)"],
  "chosen_angle": "góc đã chọn — phải là 1 trong 3 góc trên",
  "originality": {"o1": true, "o2": true, "o3": true, "o4": true, "o5": true},
  "hook": "câu hook mở đầu video (tự viết, không copy nguồn)",
  "body": "kịch bản đầy đủ: phân cảnh, lời thoại/voice-over, text trên màn hình, thời lượng từng đoạn",
  "caption": "caption đăng bài: 1 HOOK + 2-3 câu ngắn + 1 CTA (ghi 'link trong bio', KHÔNG dán URL trần) + 5-8 hashtag",
  "claims": [{"text": "nội dung claim", "claim_type": "fact|interpretation|forecast|allegation|opinion", "risk_level": "low|medium|high|critical", "confidence": "confirmed|probable|disputed|unverified"}],
  "disclosure": {"affiliate": false, "sponsored": false, "ai_voice": false, "ai_visual": false, "music_source": ""},
  "risk": {"c": 0, "p": 0, "l": 0, "a": 0, "m": 0, "h": 0},
  "ai_voice_used": false
}

Nguyên tắc ràng buộc (bắt buộc tuân thủ):
- O1-O5 originality: O1 bỏ video nguồn ra video vẫn đứng độc lập; O2 hook/cấu trúc/kết luận là của mình; O3 không dùng lại câu chữ/montage/nhạc/nhịp dựng/thumbnail của nguồn; O4 video KHÔNG thay thế nhu cầu xem video nguồn; O5 giải thích được giá trị mới trong 1 câu. Nếu góc nào trượt câu nào thì đặt false cho câu đó và vẫn trả đủ 3 góc — hệ thống sẽ từ chối góc trượt.
- Claim risk high/critical mà confidence là unverified thì KHÔNG được đưa vào, hoặc hạ wording thành ý kiến ("nguồn X nói").
- Viết tiếng Việt, ngắn gọn, đúng trọng tâm.`

  /** Tách URL đầu tiên trong nội dung nguồn → viralSourceUrl. */
  private extractFirstUrl(content: string): string | null {
    const m = content.match(/https?:\/\/[^\s)"'\]]+/)
    return m ? m[0] : null
  }

  private parseAutoBuildJson(raw: string): Record<string, any> {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new BadRequestException('AI không trả về JSON hợp lệ — hãy thử lại.')
    try {
      return JSON.parse(m[0])
    } catch {
      throw new BadRequestException('AI không trả về JSON hợp lệ — hãy thử lại.')
    }
  }

  private titleFromCaption(caption: string, fallback: string): string {
    const firstLine = caption
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0)
    const base = firstLine || fallback
    return base.length > 80 ? base.slice(0, 77) + '…' : base
  }

  /**
   * Auto-build: từ nội dung nguồn (tin nhắn AI) → AI phân tích theo quy chuẩn
   * pipeline faceless (G0 originality, claim guardrails, 3-block contract) →
   * tự điền đầy đủ project: brief, góc, kịch bản, caption, claim ledger,
   * AI register, risk score. Trả về id project để mở pipeline kiểm duyệt.
   */
  async autoBuildFromSource(workspaceId: string, dto: AutoBuildVideoDto) {
    const content = dto.content.trim()
    const viralSourceUrl = this.extractFirstUrl(content)

    // 1. Chọn provider: ưu tiên providerId được chỉ định, ngược lại lấy key
    //    đã kết nối đầu tiên theo FALLBACK_PRIORITY.
    const conns = await this.prisma.aiConnection.findMany({
      where: { workspaceId, status: 'active' },
    })
    if (conns.length === 0) {
      throw new BadRequestException(
        'Chưa kết nối AI Pro. Hãy vào Cài đặt → AI Pro để nhập API key trước.',
      )
    }
    const rank = new Map(FALLBACK_PRIORITY.map((id, i) => [id, i]))
    const sorted = [...conns].sort(
      (a, b) => (rank.get(a.provider as AiProviderId) ?? 99) - (rank.get(b.provider as AiProviderId) ?? 99),
    )
    const picked =
      (dto.providerId && conns.find((c) => c.provider === dto.providerId)) || sorted[0]
    const meta = getProviderMeta(picked.provider)
    if (!meta) throw new BadRequestException('Provider không được hỗ trợ.')
    const model = dto.model?.trim() || meta.defaultModel

    // 2. AI phân tích + sinh brief/script theo schema JSON (1 call duy nhất).
    const aiRes = await this.ai.chat(
      workspaceId,
      {
        provider: meta.id,
        model,
        maxTokens: 2048,
        messages: [
          { role: 'system', content: VideoService.AUTO_BUILD_SYSTEM },
          { role: 'user', content: `NỘI DUNG NGUỒN:\n${content}` },
        ],
      } as any,
      undefined,
    )
    const data = this.parseAutoBuildJson(aiRes.content ?? '')

    // 3. Guardrail G0 originality — tool TỪ CHỐI khi góc trượt O1–O5.
    const briefResult = await videoBriefTool.execute(
      {
        topic: data['topic'] ?? '',
        source_analysis: data['source_analysis'] ?? '',
        angles: data['angles'],
        chosen_angle: data['chosen_angle'],
        originality: data['originality'],
      },
      { workspaceId },
    )
    if (briefResult.startsWith('TỪ CHỐI') || briefResult.startsWith('G0 FAIL')) {
      throw new BadRequestException(briefResult)
    }

    // 4. Guardrail claim — tool TỪ CHỐI khi có claim high/critical unverified.
    const claims = Array.isArray(data['claims']) ? data['claims'] : []
    const scriptResult = await videoScriptTool.execute(
      {
        hook: data['hook'] ?? '',
        body: data['body'] ?? '',
        caption: data['caption'] ?? '',
        claims,
        disclosure: data['disclosure'] ?? {},
      },
      { workspaceId },
    )
    if (scriptResult.startsWith('TỪ CHỐI')) {
      throw new BadRequestException(scriptResult)
    }

    // 5. Nạp đầy đủ vào project.
    const caption: string = String(data['caption'] ?? '').trim()
    const hook: string = String(data['hook'] ?? '').trim()
    if (!caption && !hook) {
      throw new BadRequestException('AI không sinh được kịch bản/caption — hãy thử lại với nội dung nguồn rõ ràng hơn.')
    }
    const project = await this.createProject(workspaceId, {
      title: this.titleFromCaption(caption, hook || 'Video từ AI'),
      viralSourceUrl: viralSourceUrl ?? undefined,
    })
    const briefJson = JSON.stringify({
      topic: data['topic'],
      source_analysis: data['source_analysis'],
      angles: data['angles'],
      chosen_angle: data['chosen_angle'],
      originality: 'G0 PASS (O1–O5 = YES)',
      generated_by: `${meta.name} / ${model}`,
    })
    // Khối ## LƯU Ý ĐĂNG BÀI do tool sinh (disclosure) + ghi chú nguồn gốc.
    const notesBlock = scriptResult.includes('## LƯU Ý ĐĂNG BÀI')
      ? scriptResult.split('## LƯU Ý ĐĂNG BÀI')[1].trim()
      : ''
    await this.updateProject(workspaceId, project.id, {
      sourceNote: String(data['source_analysis'] ?? ''),
      stage: 'script',
      angle: String(data['chosen_angle'] ?? ''),
      briefJson,
      script: String(data['body'] ?? ''),
      caption,
      publishNotes: notesBlock,
    })

    // 6. Claim ledger: mỗi claim một dòng để kiểm chứng.
    const claimTypes = ['fact', 'interpretation', 'forecast', 'allegation', 'opinion']
    const riskLevels = ['low', 'medium', 'high', 'critical']
    const confidences = ['confirmed', 'probable', 'disputed', 'unverified']
    let claimCount = 0
    for (const c of claims.slice(0, 20)) {
      const text = String(c?.['text'] ?? '').trim()
      if (!text) continue
      await this.addClaim(workspaceId, project.id, {
        claimText: text.slice(0, 2000),
        claimType: claimTypes.includes(c?.['claim_type']) ? c['claim_type'] : 'opinion',
        riskLevel: riskLevels.includes(c?.['risk_level']) ? c['risk_level'] : 'low',
        confidence: confidences.includes(c?.['confidence']) ? c['confidence'] : 'unverified',
      } as CreateVideoClaimDto)
      claimCount++
    }

    // 7. AI register: ghi nhận AI đã tham gia dựng kịch bản/caption (A1).
    await this.addAiEntry(workspaceId, project.id, {
      assetName: 'Kịch bản + caption (AI auto-build)',
      tool: `${meta.name} / ${model}`.slice(0, 120),
      inputSource: 'Nội dung nguồn từ AI Chat/Copilot',
      outputUse: 'Kịch bản quay + caption đăng bài',
      category: 'A1',
      realPerson: false,
    })

    // 8. Risk score theo đánh giá của AI (R = C+P+L+A+M+H + veto).
    const r = (data['risk'] ?? {}) as Record<string, unknown>
    const clamp03 = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(3, Math.round(v))) : 0
    const criticalUnverified = claims.some(
      (c: any) => c?.['risk_level'] === 'critical' && c?.['confidence'] === 'unverified',
    )
    const riskResult = await this.saveRiskScore(workspaceId, project.id, {
      c: clamp03(r['c']),
      p: clamp03(r['p']),
      l: clamp03(r['l']),
      a: clamp03(r['a']),
      m: clamp03(r['m']),
      h: clamp03(r['h']),
      criticalHealthClaimUnverified: criticalUnverified,
    })

    return {
      projectId: project.id,
      title: project.title,
      provider: meta.id,
      model,
      claimCount,
      riskScore: riskResult.score,
      riskDecision: riskResult.decision,
    }
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
