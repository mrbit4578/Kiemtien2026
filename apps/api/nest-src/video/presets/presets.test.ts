import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIMELAPSE_CONSTRUCTION_PRESET,
  renderPresetPrompt,
  renderShotList,
  getDurationMap,
} from './timelapse-construction'
import { VIDEO_PRESETS, getPresetById, listPresetSummaries } from './index'

const VARS = {
  boiCanh: 'narrow urban lot between two concrete houses, street in foreground',
  vatNeo: 'giant granite boulder, 8 meters tall',
  kienTruc: 'modern minimalist villa, concrete, glass, wood slats',
  chu: 'Nể phục',
}

describe('timelapse-construction preset', () => {
  it('có đúng 30 keyframe, id duy nhất, pha hợp lệ', () => {
    const p = TIMELAPSE_CONSTRUCTION_PRESET
    assert.equal(p.keyframes.length, 30)
    const ids = p.keyframes.map((k) => k.id)
    assert.equal(new Set(ids).size, 30)
    const phaseIds = new Set(p.phases.map((x) => x.id))
    for (const k of p.keyframes) assert.ok(phaseIds.has(k.phaseId), `pha không hợp lệ: ${k.phaseId}`)
  })

  it('tổng tỉ lệ pha = 100% và bao phủ liên tục', () => {
    const phases = TIMELAPSE_CONSTRUCTION_PRESET.phases
    assert.equal(phases[0].pctStart, 0)
    assert.equal(phases[phases.length - 1].pctEnd, 100)
    for (let i = 1; i < phases.length; i++) {
      assert.equal(phases[i].pctStart, phases[i - 1].pctEnd)
    }
  })

  it('render prompt thay thế hết placeholder, không sót {{…}}', () => {
    const out = renderPresetPrompt(TIMELAPSE_CONSTRUCTION_PRESET, 'KF13', VARS)
    assert.ok(!out.includes('{{'), 'còn placeholder chưa điền')
    assert.ok(out.includes(VARS.vatNeo))
    assert.ok(out.includes('Same exact camera position'))
  })

  it('bản short: 8 shot theo đúng thứ tự duration map', () => {
    const { duration, shots } = renderShotList(TIMELAPSE_CONSTRUCTION_PRESET, 'short', VARS)
    assert.equal(duration.id, 'short')
    assert.deepEqual(
      shots.map((s) => s.id),
      ['KF01', 'KF04', 'KF08', 'KF13', 'KF19', 'KF24', 'KF29', 'KF30'],
    )
    for (const s of shots) assert.ok(!s.prompt.includes('{{'))
  })

  it('bản long: đủ 30 shot', () => {
    const { shots } = renderShotList(TIMELAPSE_CONSTRUCTION_PRESET, 'long', VARS)
    assert.equal(shots.length, 30)
  })

  it('duration không hợp lệ → fallback bản đầu tiên', () => {
    const d = getDurationMap(TIMELAPSE_CONSTRUCTION_PRESET, 'xxx')
    assert.equal(d.id, TIMELAPSE_CONSTRUCTION_PRESET.durationMaps[0].id)
  })

  it('registry: list/get hoạt động', () => {
    assert.ok(VIDEO_PRESETS.length >= 1)
    assert.equal(getPresetById('timelapse-construction')?.id, 'timelapse-construction')
    assert.equal(getPresetById('khong-ton-tai'), undefined)
    const sums = listPresetSummaries()
    assert.equal(sums[0].keyframeCount, 30)
    assert.ok(sums[0].durations.some((d) => d.id === 'short'))
  })
})
