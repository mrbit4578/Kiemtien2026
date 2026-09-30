import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { scoreEvidenceCoverage, evidenceScoreTo100 } from './niche-evidence'

describe('scoreEvidenceCoverage — playbook chương 01', () => {
  it('không có bằng chứng → mọi tiêu chí 0 điểm + cờ noEvidence', () => {
    const s = scoreEvidenceCoverage({
      realQuestions: 0,
      verifiedOffers: 0,
      verifiableSources: 0,
      contentIdeas: 0,
      distinctDays: 0,
    })
    assert.equal(s.total, 0)
    assert.equal(s.noEvidence, true)
    assert.equal(evidenceScoreTo100(s), 0)
    for (const c of Object.values(s.criteria)) assert.equal(c.score, 0)
  })

  it('trọng số đúng 30/25/20/15/10 và tổng thang 0–5', () => {
    const s = scoreEvidenceCoverage({
      realQuestions: 10, // band → 5
      verifiedOffers: 3, // 2+3 → 5
      verifiableSources: 10, // band → 5
      contentIdeas: 10, // band → 5
      distinctDays: 5, // → 5
    })
    assert.equal(s.criteria.demand.weight, 0.3)
    assert.equal(s.criteria.monetization.weight, 0.25)
    assert.equal(s.criteria.verifiability.weight, 0.2)
    assert.equal(s.criteria.producibility.weight, 0.15)
    assert.equal(s.criteria.durability.weight, 0.1)
    assert.equal(s.total, 5)
    assert.equal(s.noEvidence, false)
    assert.equal(evidenceScoreTo100(s), 100)
  })

  it('thiếu bằng chứng ở tiêu chí nào → tiêu chí đó 0, không suy diễn', () => {
    const s = scoreEvidenceCoverage({
      realQuestions: 4, // band(4) → 4
      verifiedOffers: 0, // → 0
      verifiableSources: 0, // → 0
      contentIdeas: 2, // band(2) → 3
      distinctDays: 1, // → 2
    })
    assert.equal(s.criteria.demand.score, 4)
    assert.equal(s.criteria.monetization.score, 0)
    assert.equal(s.criteria.verifiability.score, 0)
    assert.equal(s.criteria.producibility.score, 3)
    assert.equal(s.criteria.durability.score, 2)
    // 4*0.3 + 0 + 0 + 3*0.15 + 2*0.1 = 1.2 + 0.45 + 0.2 = 1.85
    assert.equal(s.total, 1.85)
  })

  it('1 bằng chứng đơn lẻ chỉ được 2 điểm (ngưỡng khó tính)', () => {
    const s = scoreEvidenceCoverage({
      realQuestions: 1,
      verifiedOffers: 0,
      verifiableSources: 0,
      contentIdeas: 0,
      distinctDays: 0,
    })
    assert.equal(s.criteria.demand.score, 2)
    assert.equal(s.noEvidence, false)
  })
})
