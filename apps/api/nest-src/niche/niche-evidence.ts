/**
 * Chấm điểm ngách theo bằng chứng — playbook mmo-ai-tiktok-roadmap-v1 chương 01.
 *
 * Nguyên tắc BẤT BIẾN: chỉ chấm khi đã có bằng chứng. Chưa có dữ liệu thì
 * để trống (0 điểm tiêu chí đó) — KHÔNG để AI tự điền con số.
 *
 * 5 tiêu chí + trọng số:
 *   demand        30% — nhu cầu có thật (câu hỏi nguyên văn + URL + ngày)
 *   monetization  25% — khả năng bán và nhận tiền (đề nghị mua đã kiểm chứng)
 *   verifiability 20% — năng lực kiểm chứng nội dung (nguồn/demo cho lời giải)
 *   producibility 15% — khả năng sản xuất đều (ý tưởng nội dung cụ thể)
 *   durability    10% — độ bền chủ đề (bằng chứng lặp lại theo thời gian)
 *
 * Pure functions — dễ unit test, không phụ thuộc DB/Nest.
 */

export interface EvidenceSignals {
  /** Số câu hỏi nguyên văn có URL + ngày thu thập. */
  realQuestions: number
  /** Số đề nghị mua đã kiểm chứng (verified). */
  verifiedOffers: number
  /** Số nguồn/demo chứng minh được lời giải. */
  verifiableSources: number
  /** Số ý tưởng nội dung cụ thể rút ra từ bằng chứng. */
  contentIdeas: number
  /** Số ngày khác nhau có bằng chứng (độ bền theo thời gian). */
  distinctDays: number
}

export interface EvidenceCriterion {
  /** Điểm 0–5. 0 = chưa có bằng chứng (để trống). */
  score: number
  weight: number
  weighted: number
  basis: string // căn cứ chấm — dòng bằng chứng nào
}

export interface EvidenceScore {
  criteria: Record<'demand' | 'monetization' | 'verifiability' | 'producibility' | 'durability', EvidenceCriterion>
  /** Tổng điểm thang 0–5. */
  total: number
  /** true khi chưa có BẤT KỲ bằng chứng nào — không dùng điểm này để quyết định. */
  noEvidence: boolean
}

const WEIGHTS = {
  demand: 0.3,
  monetization: 0.25,
  verifiability: 0.2,
  producibility: 0.15,
  durability: 0.1,
} as const

/** 1–5 theo mật độ bằng chứng; 0 khi không có gì. Ngưỡng cố ý "khó tính". */
function band(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 2
  if (n <= 3) return 3
  if (n <= 6) return 4
  return 5
}

const round2 = (x: number) => Math.round(x * 100) / 100

/**
 * Chấm điểm ngách từ tín hiệu bằng chứng đã thu thập.
 * Thiếu bằng chứng ở tiêu chí nào → tiêu chí đó 0 điểm, không suy diễn.
 */
export function scoreEvidenceCoverage(sig: EvidenceSignals): EvidenceScore {
  const demand = band(sig.realQuestions)
  const monetization = sig.verifiedOffers > 0 ? Math.min(5, 2 + sig.verifiedOffers) : 0
  const verifiability = band(sig.verifiableSources)
  const producibility = band(sig.contentIdeas)
  const durability = sig.distinctDays <= 0 ? 0 : sig.distinctDays === 1 ? 2 : sig.distinctDays <= 3 ? 3 : 5

  const mk = (
    score: number,
    weight: number,
    basis: string,
  ): EvidenceCriterion => ({ score, weight, weighted: round2(score * weight), basis })

  const criteria = {
    demand: mk(demand, WEIGHTS.demand, `${sig.realQuestions} câu hỏi thật có URL/ngày`),
    monetization: mk(monetization, WEIGHTS.monetization, `${sig.verifiedOffers} đề nghị mua đã kiểm chứng`),
    verifiability: mk(verifiability, WEIGHTS.verifiability, `${sig.verifiableSources} nguồn/demo kiểm chứng`),
    producibility: mk(producibility, WEIGHTS.producibility, `${sig.contentIdeas} ý tưởng nội dung cụ thể`),
    durability: mk(durability, WEIGHTS.durability, `bằng chứng trải ${sig.distinctDays} ngày`),
  }
  const total = round2(
    criteria.demand.weighted +
      criteria.monetization.weighted +
      criteria.verifiability.weighted +
      criteria.producibility.weighted +
      criteria.durability.weighted,
  )
  const noEvidence =
    sig.realQuestions === 0 &&
    sig.verifiedOffers === 0 &&
    sig.verifiableSources === 0 &&
    sig.contentIdeas === 0 &&
    sig.distinctDays === 0
  return { criteria, total, noEvidence }
}

/** Tổng 0–100 để cộng vào điểm mixer (total 0–5 → 0–100). */
export function evidenceScoreTo100(s: EvidenceScore): number {
  return s.noEvidence ? 0 : Math.round(s.total * 20)
}
