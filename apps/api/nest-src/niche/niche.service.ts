import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  mixNiches,
  inferTopic,
  type MixResult,
  type UsedNiche,
  type CategorySignal,
} from './niche-mixer'
import type { MarkNicheUsedDto, NicheFeedbackDto } from './dto'

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
   * MMR chọn top K đa dạng.
   */
  async mix(
    workspaceId: string,
    candidates: Array<{ id?: string; label: string; score?: number; category?: string; rationale?: string }>,
    k = 5,
  ): Promise<MixResult> {
    const [used, signals] = await Promise.all([
      this.listUsed(workspaceId),
      this.categorySignals(workspaceId),
    ])
    return mixNiches(candidates, { used, signals, options: { k } })
  }
}
