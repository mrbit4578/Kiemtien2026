/**
 * Thuật toán trộn ngách (niche mixer) — pure functions, không phụ thuộc DB/Nest,
 * dễ unit test và tái dùng.
 *
 * Pipeline "trộn tối ưu":
 *   candidates (AI trả về)
 *     → 1. LOẠI CỨNG: slug đã từng dùng ⇒ loại (nguyên tắc: đã dùng thì không lặp lại)
 *     → 2. LOẠI MỀM: label gần trùng (Jaccard ≥ ngưỡng) với ngách đã dùng hoặc
 *        với candidate đã nhận ⇒ loại (chống paraphrase)
 *     → 3. CHẤM ĐIỂM: điểm AI + novelty (mới so với đã dùng) +
 *        exploration (ưu tiên nhóm chủ đề ít được khai thác) +
 *        feedback (kaizen: nhóm nào hiệu quả thì cộng điểm) +
 *        evidence (playbook chương 01: ngách có bằng chứng thực tế được cộng
 *        điểm — chỉ khi workspace đã có dữ liệu bằng chứng)
 *     → 4. MMR rerank: chọn top K sao cho vừa điểm cao vừa đa dạng lẫn nhau
 *        (tránh 5 ngách cùng một kiểu) + topicCap ép phủ nhiều nhóm chủ đề
 *        (mỗi nhóm tối đa N ngách trong picked)
 *     → 5. BACKFILL: khi một ngách được chọn (đánh dấu đã dùng), chạy lại
 *        mixer trên pool dự phòng với excludeSlugs = ngách đang hiển thị
 *        để bổ sung 1 ngách mới tốt nhất thay thế — graph luôn đầy.
 */

export interface NicheCandidate {
  id?: string
  label: string
  score?: number
  category?: string
  rationale?: string
  [key: string]: unknown
}

export interface UsedNiche {
  slug: string
  label: string
  category?: string
  status?: string
}

export interface CategorySignal {
  picks: number // số ngách đã dùng trong nhóm chủ đề
  avgOutcome: number // -1..1 — trung bình outcome đã ghi nhận (0 nếu chưa có)
}

export interface MixWeights {
  base?: number // trọng số điểm AI gốc
  novelty?: number // trọng số độ mới so với ngách đã dùng
  exploration?: number // trọng số ưu tiên nhóm chủ đề ít khai thác
  feedback?: number // trọng số kaizen theo outcome đã ghi nhận
  evidence?: number // trọng số bằng chứng thực tế (playbook chương 01: 30/25/20/15/10)
}

export interface MixOptions {
  k?: number // số ngách lấy ra, mặc định 5 (tối đa 24)
  lambda?: number // cân bằng MMR: 1 = chỉ điểm cao, 0 = chỉ đa dạng. Mặc định 0.7
  nearDupThreshold?: number // Jaccard ≥ ngưỡng ⇒ coi như trùng. Mặc định 0.8
  topicCap?: number // số ngách tối đa mỗi nhóm chủ đề trong picked. Mặc định 2 (ép phủ nhiều nhóm)
  excludeSlugs?: string[] // slug đang hiển thị trên graph — loại để backfill không trùng
  weights?: MixWeights
}

export interface MixContext {
  used: UsedNiche[]
  signals?: Record<string, CategorySignal> // key = topic đã chuẩn hóa
  /** key = slug đã normalize, value = điểm phủ bằng chứng 0–100. */
  evidenceScores?: Record<string, number>
  options?: MixOptions
}

export interface ScoredCandidate extends NicheCandidate {
  mixScore: number
  mixDetail: { base: number; novelty: number; exploration: number; feedbackBoost: number; evidenceBoost: number }
}

export interface RejectedCandidate {
  candidate: NicheCandidate
  reason: 'already_used' | 'near_duplicate' | 'empty_label' | 'excluded'
  reasonDetail: string
}

export interface MixResult {
  picked: ScoredCandidate[]
  rejected: RejectedCandidate[]
}

// ── Chuẩn hóa & token ──────────────────────────────────────────────

/** "Ngách: Công Cụ AI & SaaS" → "ngach_cong_cu_ai_saas" */
export function normalizeSlug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const VI_STOPWORDS = new Set(
  'và của các những một là cho với trên trong để đã được như từ này kia cái việc sự người ta mình bạn họ nó ra vào đến lại còn có không gì thì mà nếu khi ở bởi hãy'.split(
    ' ',
  ),
)

/** Tách token tiếng Việt: lowercase, bỏ dấu câu, bỏ stopword, bỏ tiền tố "ngách:". */
export function viTokens(s: string): Set<string> {
  const cleaned = s
    .toLowerCase()
    .replace(/^(ngách|niche)\s*:\s*/i, '')
    .replace(/[^a-zà-ỹ0-9\s]/gi, ' ')
  const out = new Set<string>()
  for (const tok of cleaned.split(/\s+/)) {
    const t = tok.trim()
    if (t.length >= 2 && !VI_STOPWORDS.has(t)) out.add(t)
  }
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

// ── Nhóm chủ đề thô từ label (để tính exploration bonus) ───────────

const TOPIC_KEYWORDS: Array<[string, RegExp]> = [
  ['tai-chinh', /(tài chính|fintech|ngân hàng|bank|đầu tư|crypto|coin|chứng khoán|bảo hiểm|vay|thẻ)/i],
  ['suc-khoe', /(sức khỏe|health|gym|dinh dưỡng|whey|protein|làm đẹp|mỹ phẩm|skincare|giảm cân)/i],
  ['cong-nghe', /(ai\b|saas|công cụ|phần mềm|software|hosting|vps|template|notion|workflow)/i],
  ['giao-duc', /(khóa học|khoá học|course|ebook|đào tạo|ngoại ngữ|tiếng anh|kỹ năng)/i],
  ['thuong-mai', /(thời trang|fashion|gia dụng|mẹ và bé|mẹ bé|phụ kiện|đồ chơi|nội thất|decor)/i],
  ['giai-tri', /(game|gaming|giải trí|thú cưng|pet|du lịch|travel|ẩm thực)/i],
  ['bds', /(bất động sản|nhà đất|chung cư)/i],
]

/** Đoán nhóm chủ đề từ label — mặc định 'khac'. */
export function inferTopic(label: string): string {
  for (const [topic, re] of TOPIC_KEYWORDS) {
    if (re.test(label)) return topic
  }
  return 'khac'
}

// ── Chấm điểm & MMR ────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Required<MixWeights> = {
  base: 0.55,
  novelty: 0.25,
  exploration: 0.15,
  feedback: 0.05,
  evidence: 0, // mặc định tắt để tương thích ngược; service bật khi có dữ liệu bằng chứng
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export function scoreCandidate(
  candidate: NicheCandidate,
  ctx: Pick<MixContext, 'used' | 'signals' | 'evidenceScores'>,
  weights: Required<MixWeights> = DEFAULT_WEIGHTS,
): { mixScore: number; mixDetail: ScoredCandidate['mixDetail'] } {
  const base = typeof candidate.score === 'number' ? Math.max(0, Math.min(100, candidate.score)) : 70

  const tokens = viTokens(candidate.label)
  let maxSim = 0
  for (const u of ctx.used) {
    const sim = jaccard(tokens, viTokens(u.label))
    if (sim > maxSim) maxSim = sim
  }
  const novelty = 1 - maxSim

  const topic = inferTopic(candidate.label)
  const signal = ctx.signals?.[topic]
  const exploration = 1 / (1 + (signal?.picks ?? 0))
  const feedbackBoost = clamp01(((signal?.avgOutcome ?? 0) + 1) / 2) // -1..1 → 0..1

  // Bằng chứng thực tế (playbook chương 01): slug đã normalize → điểm phủ 0–100.
  // Không có dữ liệu bằng chứng thì boost = 0 — không suy diễn.
  const slug = normalizeSlug(typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : candidate.label)
  const evidenceCover = Math.max(0, Math.min(100, ctx.evidenceScores?.[slug] ?? 0))
  const evidenceBoost = weights.evidence * evidenceCover

  const mixScore =
    weights.base * base +
    weights.novelty * novelty * 100 +
    weights.exploration * exploration * 100 +
    weights.feedback * feedbackBoost * 100 +
    evidenceBoost

  return {
    mixScore: Math.round(mixScore * 10) / 10,
    mixDetail: {
      base: Math.round(base),
      novelty: Math.round(novelty * 100),
      exploration: Math.round(exploration * 100),
      feedbackBoost: Math.round(feedbackBoost * 100),
      evidenceBoost: Math.round(evidenceBoost * 10) / 10,
    },
  }
}

/**
 * Maximal Marginal Relevance: chọn lần lượt K candidate sao cho mỗi lần chọn
 * cân bằng giữa điểm cao (relevance) và khác biệt với những cái đã chọn (diversity).
 * topicCap giới hạn số ngách mỗi nhóm chủ đề — ép phủ nhiều nhóm thay vì
 * dồn vào 1-2 nhóm "ngon ăn".
 */
export function mmrSelect(
  scored: ScoredCandidate[],
  k: number,
  lambda = 0.7,
  topicCap = 2,
): ScoredCandidate[] {
  const remaining = [...scored]
  const selected: ScoredCandidate[] = []
  const topicCount = new Map<string, number>()
  const tokenCache = new Map<ScoredCandidate, Set<string>>()
  const toks = (c: ScoredCandidate) => {
    let t = tokenCache.get(c)
    if (!t) {
      t = viTokens(c.label)
      tokenCache.set(c, t)
    }
    return t
  }
  while (selected.length < Math.min(k, scored.length) && remaining.length > 0) {
    let bestIdx = -1
    let bestVal = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]
      // Ép đa dạng nhóm chủ đề: nhóm nào đã đủ quota thì bỏ qua ở vòng này
      if ((topicCount.get(inferTopic(c.label)) ?? 0) >= topicCap) continue
      let maxSim = 0
      for (const s of selected) {
        const sim = jaccard(toks(c), toks(s))
        if (sim > maxSim) maxSim = sim
      }
      const val = lambda * c.mixScore / 100 - (1 - lambda) * maxSim
      if (val > bestVal) {
        bestVal = val
        bestIdx = i
      }
    }
    // Mọi ứng viên còn lại đều vướng topicCap → nới lỏng để vẫn đủ K
    if (bestIdx === -1) {
      let bi = 0
      let bv = -Infinity
      for (let i = 0; i < remaining.length; i++) {
        const v = lambda * remaining[i].mixScore / 100
        if (v > bv) {
          bv = v
          bi = i
        }
      }
      bestIdx = bi
    }
    const [chosen] = remaining.splice(bestIdx, 1)
    selected.push(chosen)
    const t = inferTopic(chosen.label)
    topicCount.set(t, (topicCount.get(t) ?? 0) + 1)
  }
  return selected
}

// ── Pipeline chính ─────────────────────────────────────────────────

/**
 * Trộn + lọc danh sách ngách AI đề xuất theo ngữ cảnh "đã dùng" của workspace.
 * Đảm bảo: ngách đã dùng KHÔNG BAO GIỜ lọt vào `picked`.
 */
export function mixNiches(candidates: NicheCandidate[], ctx: MixContext): MixResult {
  const opts = ctx.options ?? {}
  const k = Math.max(1, Math.min(opts.k ?? 5, 24))
  const lambda = opts.lambda ?? 0.7
  const nearDupThreshold = opts.nearDupThreshold ?? 0.8
  const topicCap = Math.max(1, opts.topicCap ?? 2)
  const weights: Required<MixWeights> = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) }

  const usedSlugs = new Set(ctx.used.map((u) => normalizeSlug(u.slug)))
  const excludedSlugs = new Set((opts.excludeSlugs ?? []).map((s) => normalizeSlug(s)))
  const usedTokenSets = ctx.used.map((u) => viTokens(u.label))

  const rejected: RejectedCandidate[] = []
  const survivors: ScoredCandidate[] = []
  const acceptedTokenSets: Set<string>[] = []

  for (const c of candidates) {
    const label = typeof c.label === 'string' ? c.label.trim() : ''
    if (!label) {
      rejected.push({ candidate: c, reason: 'empty_label', reasonDetail: 'Thiếu label.' })
      continue
    }
    const slug = normalizeSlug(typeof c.id === 'string' && c.id.trim() ? c.id : label)
    // 1. Loại cứng: đã dùng
    if (usedSlugs.has(slug)) {
      rejected.push({ candidate: c, reason: 'already_used', reasonDetail: `Slug "${slug}" đã được dùng — không lặp lại.` })
      continue
    }
    // 1b. Loại cứng: đang hiển thị trên graph (dành cho backfill)
    if (excludedSlugs.has(slug)) {
      rejected.push({ candidate: c, reason: 'excluded', reasonDetail: `Slug "${slug}" đang hiển thị — không chọn trùng.` })
      continue
    }
    const tokens = viTokens(label)
    // 2. Loại mềm: gần trùng với ngách đã dùng
    const simUsed = usedTokenSets.reduce((m, t) => Math.max(m, jaccard(tokens, t)), 0)
    if (simUsed >= nearDupThreshold) {
      rejected.push({
        candidate: c,
        reason: 'near_duplicate',
        reasonDetail: `Gần trùng với ngách đã dùng (Jaccard ${simUsed.toFixed(2)} ≥ ${nearDupThreshold}).`,
      })
      continue
    }
    // 2b. Loại mềm: gần trùng với candidate đã nhận trong cùng batch
    const simBatch = acceptedTokenSets.reduce((m, t) => Math.max(m, jaccard(tokens, t)), 0)
    if (simBatch >= nearDupThreshold) {
      rejected.push({
        candidate: c,
        reason: 'near_duplicate',
        reasonDetail: `Trùng lặp trong cùng đợt quét (Jaccard ${simBatch.toFixed(2)}).`,
      })
      continue
    }
    const { mixScore, mixDetail } = scoreCandidate({ ...c, label }, ctx, weights)
    survivors.push({ ...c, label, mixScore, mixDetail })
    acceptedTokenSets.push(tokens)
  }

  // 3+4. Chấm điểm đã xong ở trên → MMR chọn top K đa dạng (có topicCap)
  const picked = mmrSelect(survivors, k, lambda, topicCap)
  return { picked, rejected }
}
