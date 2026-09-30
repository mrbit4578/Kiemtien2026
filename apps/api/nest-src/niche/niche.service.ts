import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  mixNiches,
  inferTopic,
  normalizeSlug,
  type MixResult,
  type UsedNiche,
  type CategorySignal,
  type MixWeights,
} from './niche-mixer'
import { scoreEvidenceCoverage, evidenceScoreTo100, type EvidenceSignals } from './niche-evidence'
import type { MarkNicheUsedDto, NicheFeedbackDto, CreateNicheEvidenceDto } from './dto'

/**
 * NicheService — kho "ngách đã dùng" của workspace + thuật toán trộn.
 *
 * Nguyên tắc bất biến: ngách đã được đánh dấu dùng thì KHÔNG BAO GIỜ
 * được đề xuất lặp lại (lọc cứng theo slug + lọc mềm theo độ tương đồng label).
 * Vòng kaizen: ghi nhận outcome → tín hiệu nhóm chủ đề → mixer ưu tiên
 * nhóm ít khai thác / hiệu quả tốt ở lần quét sau.
 */
@Injectable()
export class NicheService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách ngách đã dùng (để frontend loại trừ + hiển thị badge). */
  async listUsed(workspaceId: string): Promise<UsedNiche[]> {
    const rows = await this.prisma.nichePick.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      category: r.category,
      status: r.status,
    }))
  }

  /** Đánh dấu đã dùng — upsert theo (workspaceId, slug), chọn lại thì cập nhật. */
  async markUsed(workspaceId: string, dto: MarkNicheUsedDto) {
    return this.prisma.nichePick.upsert({
      where: { workspaceId_slug: { workspaceId, slug: dto.slug } },
      create: {
        workspaceId,
        slug: dto.slug,
        label: dto.label,
        category: dto.category ?? 'niche',
        score: dto.score,
        rationale: dto.rationale,
        source: dto.source ?? 'scan',
        status: 'picked',
      },
      update: {
        label: dto.label,
        category: dto.category ?? 'niche',
        score: dto.score ?? undefined,
        rationale: dto.rationale ?? undefined,
        status: 'picked',
      },
    })
  }

  /** Bỏ đánh dấu — cho phép đề xuất lại nếu user đổi ý. */
  async unmark(workspaceId: string, slug: string) {
    return this.prisma.nichePick.deleteMany({ where: { workspaceId, slug } })
  }

  /** Ghi nhận kết quả dùng ngách (kaizen). */
  async recordFeedback(workspaceId: string, slug: string, dto: NicheFeedbackDto) {
    return this.prisma.nichePick.update({
      where: { workspaceId_slug: { workspaceId, slug } },
      data: {
        status: dto.status,
        feedback: dto.feedback,
        outcome: dto.outcome,
      },
    })
  }

  /**
   * Tín hiệu kaizen theo nhóm chủ đề: số lượt đã dùng + outcome trung bình.
   * Dùng để tính exploration bonus trong mixer.
   */
  async categorySignals(workspaceId: string): Promise<Record<string, CategorySignal>> {
    const rows = await this.prisma.nichePick.findMany({
      where: { workspaceId },
      select: { label: true, outcome: true },
      take: 1000,
    })
    const acc: Record<string, { picks: number; sum: number; n: number }> = {}
    for (const r of rows) {
      const topic = inferTopic(r.label)
      const e = (acc[topic] ??= { picks: 0, sum: 0, n: 0 })
      e.picks++
      if (typeof r.outcome === 'number') {
        e.sum += r.outcome
        e.n++
      }
    }
    const out: Record<string, CategorySignal> = {}
    for (const [topic, e] of Object.entries(acc)) {
      out[topic] = { picks: e.picks, avgOutcome: e.n > 0 ? e.sum / e.n : 0 }
    }
    return out
  }

  /**
   * Trộn + lọc danh sách ngách AI đề xuất:
   * loại cứng ngách đã dùng, loại mềm paraphrase, chấm điểm đa tiêu chí,
   * MMR chọn top K đa dạng + topicCap ép phủ nhiều nhóm chủ đề.
   * Playbook chương 01: ngách có bằng chứng thực tế được cộng điểm
   * (trọng số evidence 0.10, lấy từ phần base) — không có bằng chứng thì
   * giữ nguyên trọng số cũ.
   */
  async mix(
    workspaceId: string,
    candidates: Array<{ id?: string; label: string; score?: number; category?: string; rationale?: string }>,
    opts: { k?: number; lambda?: number; topicCap?: number } = {},
  ): Promise<MixResult> {
    const [used, signals] = await Promise.all([
      this.listUsed(workspaceId),
      this.categorySignals(workspaceId),
    ])
    const slugs = candidates.map((c) =>
      normalizeSlug(typeof c.id === 'string' && c.id.trim() ? c.id : c.label),
    )
    const { evidenceScores, weights } = await this.evidenceMixContext(workspaceId, slugs)
    return mixNiches(candidates, {
      used,
      signals,
      evidenceScores,
      options: {
        k: opts.k ?? 5,
        lambda: opts.lambda ?? 0.7,
        topicCap: opts.topicCap ?? 2,
        weights,
      },
    })
  }

  // ─── Bảng ghi bằng chứng ngách (playbook chương 01/02) ───

  /** Liệt kê bằng chứng của workspace (lọc theo slug nếu có). */
  async listEvidence(workspaceId: string, nicheSlug?: string) {
    return this.prisma.nicheEvidence.findMany({
      where: { workspaceId, ...(nicheSlug ? { nicheSlug: normalizeSlug(nicheSlug) } : {}) },
      orderBy: { collectedAt: 'desc' },
      take: 500,
    })
  }

  /** Thêm một dòng bằng chứng — câu hỏi thật + URL/ngày thu thập. */
  async addEvidence(workspaceId: string, dto: CreateNicheEvidenceDto) {
    let collectedAt: Date | undefined
    if (dto.collectedAt) {
      const d = new Date(dto.collectedAt)
      if (Number.isNaN(d.getTime())) throw new Error('collectedAt không phải ngày hợp lệ.')
      collectedAt = d
    }
    return this.prisma.nicheEvidence.create({
      data: {
        workspaceId,
        nicheSlug: normalizeSlug(dto.nicheSlug),
        questionText: dto.questionText.trim(),
        market: dto.market?.trim() || null,
        audience: dto.audience?.trim() || null,
        url: dto.url?.trim() || null,
        metricSeen: dto.metricSeen?.trim() || null,
        metricNotProven: dto.metricNotProven || null,
        contentIdea: dto.contentIdea || null,
        relatedOffer: dto.relatedOffer?.trim() || null,
        checkResult: dto.checkResult || null,
        ...(collectedAt ? { collectedAt } : {}),
      },
    })
  }

  /** Xóa một dòng bằng chứng. */
  async deleteEvidence(workspaceId: string, id: string) {
    const row = await this.prisma.nicheEvidence.findFirst({ where: { id, workspaceId } })
    if (!row) throw new Error('Không tìm thấy dòng bằng chứng.')
    await this.prisma.nicheEvidence.delete({ where: { id } })
    return { ok: true }
  }

  /**
   * Gom tín hiệu bằng chứng theo từng slug: câu hỏi thật (có URL), nguồn
   * kiểm chứng được, ý tưởng nội dung, đề nghị mua đã xác minh, số ngày.
   */
  async evidenceSignals(workspaceId: string, slugs: string[]): Promise<Record<string, EvidenceSignals>> {
    const normed = [...new Set(slugs.map((s) => normalizeSlug(s)))]
    const [rows, offers] = await Promise.all([
      this.prisma.nicheEvidence.findMany({ where: { workspaceId, nicheSlug: { in: normed } }, take: 2000 }),
      this.prisma.monetizationOffer.findMany({
        where: { workspaceId, nicheSlug: { in: normed }, verified: true },
        select: { nicheSlug: true },
        take: 500,
      }),
    ])
    const out: Record<string, EvidenceSignals> = {}
    for (const s of normed) {
      out[s] = { realQuestions: 0, verifiedOffers: 0, verifiableSources: 0, contentIdeas: 0, distinctDays: 0 }
    }
    const days = new Map<string, Set<string>>()
    for (const r of rows) {
      const e = out[r.nicheSlug]
      if (!e) continue
      if (r.url) e.realQuestions++
      if (r.url || r.checkResult) e.verifiableSources++
      if (r.contentIdea) e.contentIdeas++
      const d = r.collectedAt.toISOString().slice(0, 10)
      let set = days.get(r.nicheSlug)
      if (!set) {
        set = new Set()
        days.set(r.nicheSlug, set)
      }
      set.add(d)
    }
    for (const [slug, set] of days) {
      const e = out[slug]
      if (e) e.distinctDays = set.size
    }
    for (const o of offers) {
      const key = o.nicheSlug ? normalizeSlug(o.nicheSlug) : null
      if (key && out[key]) out[key].verifiedOffers++
    }
    return out
  }

  /**
   * Điểm phủ bằng chứng 0–100 cho từng slug + trọng số mixer.
   * Không có bằng chứng nào → trả weights undefined (giữ nguyên hành vi cũ).
   */
  async evidenceMixContext(
    workspaceId: string,
    slugs: string[],
  ): Promise<{ evidenceScores: Record<string, number>; weights?: MixWeights }> {
    const signals = await this.evidenceSignals(workspaceId, slugs)
    const evidenceScores: Record<string, number> = {}
    let anyEvidence = false
    for (const [slug, sig] of Object.entries(signals)) {
      const s = scoreEvidenceCoverage(sig)
      evidenceScores[slug] = evidenceScoreTo100(s)
      if (!s.noEvidence) anyEvidence = true
    }
    if (!anyEvidence) return { evidenceScores: {} }
    // Phân bổ lại: evidence 0.10 lấy từ base (0.55 → 0.45), tổng vẫn = 1.
    return {
      evidenceScores,
      weights: { base: 0.45, novelty: 0.25, exploration: 0.15, feedback: 0.05, evidence: 0.1 },
    }
  }

  /** Điểm bằng chứng chi tiết cho 1..n slug (để UI hiển thị). */
  async evidenceScoreDetail(workspaceId: string, slugs: string[]) {
    const signals = await this.evidenceSignals(workspaceId, slugs)
    const out: Record<string, { score100: number; total: number; noEvidence: boolean; criteria: unknown }> = {}
    for (const [slug, sig] of Object.entries(signals)) {
      const s = scoreEvidenceCoverage(sig)
      out[slug] = { score100: evidenceScoreTo100(s), total: s.total, noEvidence: s.noEvidence, criteria: s.criteria }
    }
    return out
  }

  /**
   * Thay thế ngách vừa được chọn: đánh dấu đã dùng (không bao giờ đề xuất lại),
   * rồi chọn 1 ngách backfill tốt nhất từ pool dự phòng — loại trừ ngách đã dùng
   * và các ngách đang hiển thị trên graph. Graph luôn được bổ sung đầy.
   * Trả về null khi pool đã cạn (frontend sẽ gợi ý quét bổ sung).
   */
  async replace(
    workspaceId: string,
    picked: { slug: string; label: string; category?: string; score?: number; rationale?: string },
    pool: Array<{ id?: string; label: string; score?: number; category?: string; rationale?: string }>,
    visibleSlugs: string[],
  ): Promise<{ backfill: MixResult['picked'][number] | null; rejectedCount: number }> {
    await this.markUsed(workspaceId, {
      slug: picked.slug,
      label: picked.label,
      category: picked.category ?? 'niche',
      score: picked.score,
      rationale: picked.rationale,
      source: 'scan',
    })
    const [used, signals] = await Promise.all([
      this.listUsed(workspaceId),
      this.categorySignals(workspaceId),
    ])
    const backfillSlugs = pool.map((c) =>
      normalizeSlug(typeof c.id === 'string' && c.id.trim() ? c.id : c.label),
    )
    const { evidenceScores, weights } = await this.evidenceMixContext(workspaceId, backfillSlugs)
    const { picked: backfills, rejected } = mixNiches(pool, {
      used,
      signals,
      evidenceScores,
      options: { k: 1, lambda: 0.55, topicCap: 2, excludeSlugs: visibleSlugs, weights },
    })
    return { backfill: backfills[0] ?? null, rejectedCount: rejected.length }
  }
}
