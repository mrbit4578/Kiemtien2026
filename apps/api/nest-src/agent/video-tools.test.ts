import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { videoBriefTool, videoScriptTool, videoRiskScoreTool } from './video-tools'

const goodBrief = {
  topic: 'Mẹo tiết kiệm điện điều hòa',
  source_analysis: 'Video viral: hook "điều hòa tốn điện vì sai lầm này", claim chưa kiểm chứng về 30% tiết kiệm, format talking-head, comment hỏi nhiều về tiền điện.',
  angles: [
    'Kiểm chứng 3 điều kiện để mẹo đúng + trường hợp thất bại',
    'So sánh mẹo này với 2 phương pháp tiết kiệm điện khác',
    'Checklist 30 giây: 5 việc làm trước khi bật điều hòa',
  ],
  chosen_angle: 'Kiểm chứng 3 điều kiện để mẹo đúng + trường hợp thất bại',
  originality: { o1: true, o2: true, o3: true, o4: true, o5: true },
}

describe('video_brief — G0 originality gate', () => {
  it('PASS khi O1–O5 đều YES', async () => {
    const out = await videoBriefTool.execute(goodBrief as any, {} as any)
    assert.match(out, /G0 PASS/)
    assert.match(out, /Kiểm chứng 3 điều kiện/)
  })

  it('TỪ CHỐI khi thiếu 3 góc', async () => {
    const out = await videoBriefTool.execute({ ...goodBrief, angles: ['một góc'] } as any, {} as any)
    assert.match(out, /TỪ CHỐI/)
  })

  it('G0 FAIL khi 1 câu originality là KHÔNG — buộc đổi góc', async () => {
    const out = await videoBriefTool.execute(
      { ...goodBrief, originality: { o1: true, o2: false, o3: true, o4: true, o5: true } } as any,
      {} as any,
    )
    assert.match(out, /G0 FAIL/)
    assert.match(out, /chọn góc khác/)
  })

  it('TỪ CHỐI khi chosen_angle không nằm trong 3 góc', async () => {
    const out = await videoBriefTool.execute(
      { ...goodBrief, chosen_angle: 'góc ngoài danh sách' } as any,
      {} as any,
    )
    assert.match(out, /TỪ CHỐI/)
  })
})

describe('video_script — claim gate + output contract 3 khối', () => {
  const base = {
    hook: 'Điều hòa nhà bạn tốn điện gấp đôi vì 3 sai lầm này',
    body: 'Cảnh 1 (0-3s): ...',
    caption: 'Hook...\nNội dung...\nCTA link trong bio\n#tag1 #tag2',
  }

  it('trả về đúng 3 khối khi claim đã xác minh', async () => {
    const out = await videoScriptTool.execute(
      {
        ...base,
        claims: [{ text: 'Vệ sinh lưới lọc giúp tiết kiệm điện', claim_type: 'fact', risk_level: 'low', confidence: 'confirmed' }],
        disclosure: { affiliate: true, music_source: 'YouTube Audio Library' },
      } as any,
      {} as any,
    )
    assert.match(out, /## KỊCH BẢN QUAY/)
    assert.match(out, /## CAPTION ĐĂNG BÀI/)
    assert.match(out, /## LƯU Ý ĐĂNG BÀI/)
    assert.match(out, /tiếp thị liên kết/)
  })

  it('TỪ CHỐI khi claim high/critical chưa xác minh', async () => {
    const out = await videoScriptTool.execute(
      {
        ...base,
        claims: [{ text: 'Mẹo này chữa được bệnh X', claim_type: 'fact', risk_level: 'critical', confidence: 'unverified' }],
      } as any,
      {} as any,
    )
    assert.match(out, /TỪ CHỐI/)
    assert.match(out, /chưa xác minh/)
  })

  it('ghi chú claim unverified mức thấp (không chặn, chỉ cảnh báo)', async () => {
    const out = await videoScriptTool.execute(
      {
        ...base,
        claims: [{ text: 'Nhiều người thấy hiệu quả', claim_type: 'opinion', risk_level: 'low', confidence: 'unverified' }],
      } as any,
      {} as any,
    )
    assert.match(out, /## LƯU Ý ĐĂNG BÀI/)
    assert.match(out, /chưa xác minh/)
  })
})

describe('video_risk_score — R = C+P+L+A+M+H + veto', () => {
  it('điểm thấp → tiếp tục', async () => {
    const out = await videoRiskScoreTool.execute({ c: 0, p: 0, l: 1, a: 0, m: 1, h: 0 } as any, {} as any)
    assert.match(out, /Risk score: 2\/18/)
    assert.match(out, /Tiếp tục/)
  })

  it('điểm 8–11 → viết lại', async () => {
    const out = await videoRiskScoreTool.execute({ c: 2, p: 2, l: 1, a: 2, m: 1, h: 1 } as any, {} as any)
    assert.match(out, /Risk score: 9\/18/)
    assert.match(out, /Viết lại/)
  })

  it('veto A4 không consent → REJECT bất chấp điểm thấp', async () => {
    const out = await videoRiskScoreTool.execute(
      { c: 0, p: 1, l: 0, a: 0, m: 0, h: 0, a4_no_consent: true } as any,
      {} as any,
    )
    assert.match(out, /REJECT/)
    assert.match(out, /A4/)
  })

  it('veto claim critical chưa xác minh → REJECT', async () => {
    const out = await videoRiskScoreTool.execute(
      { c: 0, p: 0, l: 0, a: 1, m: 0, h: 1, critical_claim_unverified: true } as any,
      {} as any,
    )
    assert.match(out, /REJECT/)
  })
})
