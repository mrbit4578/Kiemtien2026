import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateClaimMarkers, UNVERIFIED_MARKER } from './claim-evidence'

const mk = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  claimText: 'Mạng nơ-ron học từ dữ liệu có nhãn.',
  claimType: 'fact',
  confidence: 'confirmed',
  status: 'open',
  scriptCode: '[C1]',
  primarySource: 'https://developers.google.com/machine-learning/crash-course/',
  secondarySource: null,
  evidenceExcerpt: null,
  ...over,
})

describe('validateClaimMarkers — playbook chương 06/07', () => {
  it('claim đã xác minh có nguồn → ok', () => {
    const r = validateClaimMarkers([mk()])
    assert.equal(r.ok, true)
    assert.equal(r.total, 1)
  })

  it('claim unverified đang mở → bắt buộc ghi CHƯA XÁC MINH', () => {
    const r = validateClaimMarkers([mk({ confidence: 'unverified', primarySource: null })])
    assert.equal(r.ok, false)
    assert.equal(r.mustMarkUnverified.length, 1)
    assert.ok(r.mustMarkUnverified[0].reason.includes(UNVERIFIED_MARKER))
    assert.ok(r.mustMarkUnverified[0].reason.includes('[C1]'))
  })

  it('claim fact thiếu nguồn lẫn đoạn căn cứ → missingEvidence', () => {
    const r = validateClaimMarkers([
      mk({ claimType: 'fact', confidence: 'probable', primarySource: null }),
    ])
    assert.equal(r.ok, false)
    assert.equal(r.missingEvidence.length, 1)
  })

  it('đoạn căn cứ (evidenceExcerpt) được tính là có căn cứ', () => {
    const r = validateClaimMarkers([
      mk({ claimType: 'fact', confidence: 'probable', primarySource: null, evidenceExcerpt: 'Trọng số được học từ dữ liệu.' }),
    ])
    assert.equal(r.missingEvidence.length, 0)
  })

  it('opinion không bị nhắc thiếu nguồn; claim đã withdrawn được bỏ qua', () => {
    const r = validateClaimMarkers([
      mk({ id: 'o1', claimType: 'opinion', confidence: 'probable', primarySource: null }),
      mk({ id: 'w1', confidence: 'unverified', primarySource: null, status: 'withdrawn' }),
    ])
    assert.equal(r.ok, true)
    assert.equal(r.total, 1)
  })
})
