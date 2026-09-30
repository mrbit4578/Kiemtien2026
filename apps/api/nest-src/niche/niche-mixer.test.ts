import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSlug,
  viTokens,
  jaccard,
  inferTopic,
  scoreCandidate,
  mmrSelect,
  mixNiches,
  type NicheCandidate,
} from './niche-mixer'

describe('normalizeSlug', () => {
  it('bỏ dấu tiếng Việt và chuẩn hóa', () => {
    assert.equal(normalizeSlug('Ngách: Công Cụ AI & SaaS'), 'ngach_cong_cu_ai_saas')
    assert.equal(normalizeSlug('  Tài-Chính 2026!! '), 'tai_chinh_2026')
  })
})

describe('viTokens', () => {
  it('bỏ tiền tố Ngách: và stopword', () => {
    const toks = viTokens('Ngách: Công Cụ AI & SaaS cho người mới')
    assert.ok(toks.has('công'))
    assert.ok(toks.has('cụ'))
    assert.ok(!toks.has('ngách'))
    assert.ok(!toks.has('cho'))
    assert.ok(!toks.has('người')) // stopword
  })
})

describe('jaccard', () => {
  it('giống hệt = 1, khác hẳn = 0', () => {
    assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1)
    assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0)
    assert.equal(jaccard(new Set(), new Set(['b'])), 0)
  })
})

describe('inferTopic', () => {
  it('đoán đúng nhóm chủ đề', () => {
    assert.equal(inferTopic('Ngách: Fintech cho giới trẻ'), 'tai-chinh')
    assert.equal(inferTopic('Ngách: Whey Protein & Dinh Dưỡng'), 'suc-khoe')
    assert.equal(inferTopic('Ngách: Template Notion & AI Workflows'), 'cong-nghe')
    assert.equal(inferTopic('Ngách: Thứ gì đó rất lạ'), 'khac')
  })
})

const used = [
  { slug: 'cong_cu_ai_saas', label: 'Ngách: Công Cụ AI & SaaS' },
  { slug: 'tai_chinh_fintech', label: 'Ngách: Tài Chính & Fintech' },
]

describe('mixNiches — nguyên tắc không lặp lại', () => {
  it('slug đã dùng thì KHÔNG BAO GIỜ lọt vào picked', () => {
    const candidates: NicheCandidate[] = [
      { id: 'cong_cu_ai_saas', label: 'Ngách: Công Cụ AI & SaaS', score: 99 },
      { id: 'gadget_moi', label: 'Ngách: Gadget Công Nghệ Mới', score: 80 },
    ]
    const { picked, rejected } = mixNiches(candidates, { used })
    assert.equal(picked.length, 1)
    assert.equal(picked[0].label, 'Ngách: Gadget Công Nghệ Mới')
    assert.equal(rejected.length, 1)
    assert.equal(rejected[0].reason, 'already_used')
  })

  it('label paraphrase gần trùng với đã dùng thì bị loại', () => {
    const candidates: NicheCandidate[] = [
      { id: 'ai_saas_tools', label: 'Ngách: Công Cụ AI và SaaS', score: 95 },
      { id: 'du_lich_bui', label: 'Ngách: Du Lịch Bụi Tiết Kiệm', score: 70 },
    ]
    const { picked, rejected } = mixNiches(candidates, { used })
    assert.ok(picked.every((p) => p.label !== 'Ngách: Công Cụ AI và SaaS'))
    assert.ok(rejected.some((r) => r.reason === 'near_duplicate'))
  })

  it('label trống bị loại', () => {
    const { picked, rejected } = mixNiches([{ label: '   ' }], { used })
    assert.equal(picked.length, 0)
    assert.equal(rejected[0].reason, 'empty_label')
  })
})

describe('mixNiches — trộn đa dạng (MMR)', () => {
  it('không chọn 3 ngách cùng kiểu khi có lựa chọn khác biệt', () => {
    const candidates: NicheCandidate[] = [
      { id: 'a1', label: 'Ngách: AI Viết Content', score: 90 },
      { id: 'a2', label: 'Ngách: AI Tạo Content', score: 89 },
      { id: 'a3', label: 'Ngách: AI Content Marketing', score: 88 },
      { id: 'b1', label: 'Ngách: Nuôi Cá Cảnh Nước Ngọt', score: 75 },
    ]
    const { picked } = mixNiches(candidates, { used: [], options: { k: 2, lambda: 0.5 } })
    assert.equal(picked.length, 2)
    // MMR với lambda thấp phải ưu tiên đa dạng: ngách cá cảnh phải lọt vào
    assert.ok(picked.some((p) => p.id === 'b1'), `picked: ${picked.map((p) => p.id).join(',')}`)
  })

  it('tôn trọng k', () => {
    const topics = [
      'Nuôi Cá Cảnh Nước Ngọt', 'Fintech Thẻ Tín Dụng', 'Khóa Học Nấu Ăn',
      'Whey Protein & Dinh Dưỡng', 'Template Notion & AI Workflows', 'Du Lịch Bụi Tiết Kiệm',
      'Trồng Rau Thủy Canh', 'Game Mobile Cày Thuê', 'Nội Thất Chung Cư Nhỏ', 'Mỹ Phẩm Thuần Chay',
    ]
    const candidates: NicheCandidate[] = topics.map((t, i) => ({ id: `n${i}`, label: `Ngách: ${t}`, score: 60 + i }))
    const { picked } = mixNiches(candidates, { used: [], options: { k: 3 } })
    assert.equal(picked.length, 3)
  })
})

describe('mixNiches — kaizen (exploration & feedback)', () => {
  it('ưu tiên nhóm chủ đề ít được khai thác', () => {
    const candidates: NicheCandidate[] = [
      { id: 't1', label: 'Ngách: Fintech Thẻ Tín Dụng', score: 80 },
      { id: 't2', label: 'Ngách: Khóa Học Nấu Ăn', score: 80 },
    ]
    const signals = { 'tai-chinh': { picks: 10, avgOutcome: 0 }, 'giao-duc': { picks: 0, avgOutcome: 0 } }
    const { picked } = mixNiches(candidates, { used: [], signals, options: { k: 2 } })
    const edu = picked.find((p) => p.id === 't2')!
    const fin = picked.find((p) => p.id === 't1')!
    assert.ok(edu.mixScore > fin.mixScore, `edu=${edu.mixScore} fin=${fin.mixScore}`)
    assert.ok(edu.mixDetail.exploration > fin.mixDetail.exploration)
  })

  it('feedback tốt cộng điểm, feedback xấu trừ điểm', () => {
    const candidates: NicheCandidate[] = [{ id: 'x', label: 'Ngách: Game Mobile', score: 80 }]
    const good = scoreCandidate(candidates[0], { used: [], signals: { 'giai-tri': { picks: 2, avgOutcome: 1 } } })
    const bad = scoreCandidate(candidates[0], { used: [], signals: { 'giai-tri': { picks: 2, avgOutcome: -1 } } })
    assert.ok(good.mixScore > bad.mixScore)
  })

  it('novelty: càng khác ngách đã dùng càng được cộng điểm', () => {
    const fresh: NicheCandidate = { id: 'f1', label: 'Ngách: Trồng Rau Thủy Canh', score: 80 }
    const similar: NicheCandidate = { id: 'f2', label: 'Ngách: Công Cụ AI Cho SaaS', score: 80 }
    const a = scoreCandidate(fresh, { used })
    const b = scoreCandidate(similar, { used })
    assert.ok(a.mixDetail.novelty > b.mixDetail.novelty)
    assert.ok(a.mixScore > b.mixScore)
  })
})

describe('mmrSelect', () => {
  it('trả về đúng k phần tử, không trùng', () => {
    const scored = [80, 70, 60, 50].map((s, i) => ({
      id: `m${i}`,
      label: `Ngách: Lĩnh vực ${['A', 'B', 'C', 'D'][i]} hoàn toàn khác`,
      mixScore: s,
      mixDetail: { base: s, novelty: 50, exploration: 50, feedbackBoost: 50 },
    }))
    const picked = mmrSelect(scored, 2)
    assert.equal(picked.length, 2)
    assert.equal(new Set(picked.map((p) => p.id)).size, 2)
  })
})

describe('topicCap — ép phủ nhiều nhóm chủ đề', () => {
  it('mỗi nhóm chủ đề tối đa topicCap ngách trong picked', () => {
    const candidates: NicheCandidate[] = [
      { id: 'a1', label: 'Ngách: Tool AI Viết Content', score: 95 },
      { id: 'a2', label: 'Ngách: Phần Mềm Quản Lý Kho', score: 94 },
      { id: 'a3', label: 'Ngách: Template Notion Bán Hàng', score: 93 },
      { id: 'b1', label: 'Ngách: Khóa Học Nấu Ăn', score: 70 },
      { id: 'b2', label: 'Ngách: Ebook Dạy Tiếng Anh', score: 69 },
    ]
    const { picked } = mixNiches(candidates, { used: [], options: { k: 4, lambda: 1, topicCap: 2 } })
    const counts: Record<string, number> = {}
    for (const p of picked) {
      const t = inferTopic(p.label)
      counts[t] = (counts[t] ?? 0) + 1
    }
    for (const n of Object.values(counts)) assert.ok(n <= 2, `vượt cap: ${JSON.stringify(counts)}`)
    // nhóm cong-nghe có 3 ứng viên điểm cao nhưng chỉ được lấy tối đa 2
    assert.ok((counts['cong-nghe'] ?? 0) <= 2)
    assert.equal(picked.length, 4)
  })

  it('nới lỏng cap khi không đủ ứng viên để đạt k', () => {
    const candidates: NicheCandidate[] = [
      { id: 'a1', label: 'Ngách: Tool AI Viết Content', score: 90 },
      { id: 'a2', label: 'Ngách: Phần Mềm Quản Lý Kho', score: 89 },
      { id: 'a3', label: 'Ngách: Template Notion Bán Hàng', score: 88 },
    ]
    const { picked } = mixNiches(candidates, { used: [], options: { k: 3, lambda: 1, topicCap: 1 } })
    assert.equal(picked.length, 3, 'vẫn đủ k nhờ nới lỏng')
  })
})

describe('excludeSlugs — backfill không trùng ngách đang hiển thị', () => {
  it('loại slug đang hiển thị với reason excluded', () => {
    const candidates: NicheCandidate[] = [
      { id: 'v1', label: 'Ngách: Tool AI Viết Content', score: 95 },
      { id: 'n1', label: 'Ngách: Trồng Rau Thủy Canh', score: 80 },
    ]
    const { picked, rejected } = mixNiches(candidates, {
      used: [],
      options: { k: 1, excludeSlugs: ['v1'] },
    })
    assert.equal(picked.length, 1)
    assert.equal(picked[0].id, 'n1')
    assert.ok(rejected.some((r) => r.reason === 'excluded'), 'phải có rejected reason=excluded')
  })

  it('ngách đã dùng vẫn bị loại cứng ngay cả khi backfill', () => {
    const used = [{ slug: 'cu_lam_dep', label: 'Ngách: Cụ Làm Đẹp' }]
    const candidates: NicheCandidate[] = [
      { id: 'cu_lam_dep', label: 'Ngách: Cụ Làm Đẹp', score: 99 },
      { id: 'n1', label: 'Ngách: Trồng Rau Thủy Canh', score: 80 },
    ]
    const { picked } = mixNiches(candidates, { used, options: { k: 1, excludeSlugs: [] } })
    assert.equal(picked[0].id, 'n1')
  })
})
