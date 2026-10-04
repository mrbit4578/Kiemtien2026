import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildDirectorBriefMd } from './director-brief'

const BASE_PROJECT = {
  id: 'cm1234abcdef',
  title: 'Bảo hiểm thiết bị: 3 điều khoản hay bị bỏ qua',
  series: 'hieu-bao-hiem',
  viralSourceUrl: 'https://www.tiktok.com/@xyz/video/123',
  sourceNote: 'Video viral phân tích 3 điều khoản loại trừ.',
  angle: 'Đọc ngược điều khoản loại trừ.',
  briefJson: JSON.stringify({
    topic: 'bảo hiểm thiết bị cá nhân',
    hook: 'Điện thoại rơi vỡ màn hình — bạn nghĩ được đền 100%?',
    chosen_angle: 'góc đọc ngược',
  }),
  script:
    'Cảnh 1: Điện thoại rơi vỡ màn hình, người dùng hoảng hốt. (0-5s)\n' +
    'Cảnh 2: Mở app bảo hiểm, đọc điều khoản loại trừ rơi vỡ.\n' +
    'Cảnh 3: So sánh 2 gói bảo hiểm trên màn hình điện thoại.',
  caption:
    'Điện thoại rơi vỡ màn hình — bạn nghĩ được đền 100%?\n\nRơi vỡ chỉ được đền khi mua thêm gói mở rộng.\n\nBình luận "BAOHIEM" để nhận checklist.\n\n#baohiem #meovat',
  publishNotes: 'Gắn nhãn AI cho voiceover.',
  riskBreakdown: JSON.stringify({ c: 0, p: 1, l: 2, a: 2, m: 1, h: 0 }),
}

const BASE_CLAIMS = [
  {
    claimText: 'Gói cơ bản không bồi thường rơi vỡ màn hình',
    claimType: 'fact',
    riskLevel: 'medium',
    confidence: 'probable',
    primarySource: 'Điều khoản mẫu công ty BH X',
  },
  {
    claimText: 'Nên đọc kỹ điều khoản loại trừ trước khi ký',
    claimType: 'opinion',
    riskLevel: 'low',
    confidence: 'confirmed',
  },
]

describe('buildDirectorBriefMd', () => {
  it('sinh frontmatter + 8 trường đúng chuẩn brief Director Studio', () => {
    const r = buildDirectorBriefMd(BASE_PROJECT, BASE_CLAIMS)
    assert.match(r.filename, /^brief-kt-[a-z0-9]+-.+\.md$/)
    assert.match(r.markdown, /^---\nbrief_id: KT-/)
    assert.ok(r.markdown.includes('doc_id: kiemtien2026-video'))
    assert.ok(r.markdown.includes('duration: 60'))
    for (const field of ['Nguồn:', 'Đối tượng:', 'Góc mới', 'Hook gợi ý', 'Dàn ý cảnh:', 'Claim ledger:', 'Rủi ro / gate:', 'Thời lượng:']) {
      assert.ok(r.markdown.includes(field), `thiếu trường ${field}`)
    }
  })

  it('tách dàn ý cảnh từ kịch bản dạng "Cảnh N"', () => {
    const r = buildDirectorBriefMd(BASE_PROJECT, BASE_CLAIMS)
    assert.ok(r.markdown.includes('1. Điện thoại rơi vỡ màn hình, người dùng hoảng hốt.'))
    assert.ok(r.markdown.includes('2. Mở app bảo hiểm'))
    assert.ok(!r.markdown.includes('(0-5s)'), 'phải strip timing ở cuối beat')
  })

  it('KHÔNG BAO GIỜ map claim sang VERIFIED (trung thực evidence-first)', () => {
    const r = buildDirectorBriefMd(BASE_PROJECT, BASE_CLAIMS)
    assert.ok(!/\bVERIFIED\b/.test(r.markdown), 'brief mapping không được chứa VERIFIED')
    assert.ok(r.markdown.includes('— UNVERIFIED'), 'claim fact phải UNVERIFIED')
    assert.ok(r.markdown.includes('EDITORIAL'), 'claim opinion phải EDITORIAL')
  })

  it('lấy hook từ briefJson, CTA từ caption', () => {
    const r = buildDirectorBriefMd(BASE_PROJECT, BASE_CLAIMS)
    assert.ok(r.markdown.includes('Điện thoại rơi vỡ màn hình — bạn nghĩ được đền 100%?'))
    assert.match(r.markdown, /cta: Bình luận "BAOHIEM"/)
  })

  it('fallback graceful khi kịch bản trống (warning, không throw)', () => {
    const r = buildDirectorBriefMd({ ...BASE_PROJECT, script: '', caption: '' }, [])
    assert.ok(r.warnings.length > 0)
    assert.ok(r.markdown.includes('Dàn ý cảnh:'))
  })

  it('mapper vẫn chạy được với caption khi thiếu script (lấy hook từ caption)', () => {
    const r = buildDirectorBriefMd(
      {
        ...BASE_PROJECT,
        briefJson: JSON.stringify({ topic: 'test' }),
        script: null,
        caption: 'Hook dòng đầu\n\nCTA: bình luận nhé',
      },
      [],
    )
    assert.ok(r.markdown.includes('Hook dòng đầu'))
  })

  it('risk_accuracy suy từ claim riskLevel', () => {
    const high = buildDirectorBriefMd(BASE_PROJECT, [
      { claimText: 'x', claimType: 'fact', riskLevel: 'critical', confidence: 'unverified' },
    ])
    assert.match(high.markdown, /risk_accuracy: high/)
    const low = buildDirectorBriefMd(
      { ...BASE_PROJECT, riskBreakdown: JSON.stringify({ c: 0, p: 0, l: 0, a: 0, m: 0, h: 0 }) },
      [{ claimText: 'x', claimType: 'fact', riskLevel: 'low', confidence: 'confirmed' }],
    )
    assert.match(low.markdown, /risk_accuracy: low/)
  })
})
