import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonLoose, pcmToWav, dataUrlParts } from './utils'

describe('videogen helpers', () => {
  it('parseJsonLoose: cắt ```json fence', () => {
    const out = parseJsonLoose('```json\n{"title":"X","scenes":[]}\n```')
    assert.equal(out.title, 'X')
    assert.deepEqual(out.scenes, [])
  })

  it('parseJsonLoose: lấy JSON giữa text thừa', () => {
    const out = parseJsonLoose('Đây là kịch bản:\n{"a":1}\nHết.')
    assert.equal(out.a, 1)
  })

  it('parseJsonLoose: ném lỗi khi không có JSON', () => {
    assert.throws(() => parseJsonLoose('không có json ở đây'), /JSON/)
  })

  it('pcmToWav: header WAV hợp lệ, đúng sample rate', () => {
    const pcm = Buffer.alloc(48000 * 2) // 1s mono 16-bit @24kHz
    const wav = pcmToWav(pcm, 24000)
    assert.equal(wav.length, 44 + pcm.length)
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
    assert.equal(wav.readUInt32LE(24), 24000)
    assert.equal(wav.readUInt16LE(20), 1) // PCM
    assert.equal(wav.readUInt16LE(22), 1) // mono
    assert.equal(wav.toString('ascii', 36, 40), 'data')
  })

  it('dataUrlParts: tách mime + base64', () => {
    const p = dataUrlParts('data:image/png;base64,iVBORw0=')
    assert.ok(p)
    assert.equal(p!.mime, 'image/png')
    assert.equal(p!.b64, 'iVBORw0=')
  })

  it('dataUrlParts: trả null khi không phải data URL', () => {
    assert.equal(dataUrlParts('https://example.com/x.png'), null)
    assert.equal(dataUrlParts(''), null)
  })
})
