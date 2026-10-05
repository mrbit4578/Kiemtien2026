import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonLoose, pcmToWav, dataUrlParts, chunkText, buildSrt, mp3DurationMs } from './utils'

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

describe('chunkText', () => {
  it('tách câu theo dấu câu, gom greedy ≤ 50 từ', () => {
    const s1 = Array(20).fill('mot').join(' ') + '.'
    const s2 = Array(20).fill('hai').join(' ') + '!'
    const s3 = Array(20).fill('ba').join(' ') + '?'
    const chunks = chunkText(`${s1} ${s2} ${s3}`)
    assert.equal(chunks.length, 2)
    assert.equal(chunks[0].split(' ').length, 40)
    assert.ok(chunks[0].endsWith('!'))
    assert.equal(chunks[1].split(' ').length, 20)
  })

  it('câu đơn dài hơn maxWords → chẻ cứng theo từ', () => {
    const chunks = chunkText(Array(120).fill('tu').join(' '))
    assert.equal(chunks.length, 3)
    assert.deepEqual(chunks.map((c) => c.split(' ').length), [50, 50, 20])
  })

  it('tách theo xuống dòng', () => {
    const chunks = chunkText('dong mot\ndong hai\ndong ba')
    assert.deepEqual(chunks, ['dong mot dong hai dong ba'])
  })

  it('text rỗng → []', () => {
    assert.deepEqual(chunkText(''), [])
    assert.deepEqual(chunkText('   \n  '), [])
  })
})

describe('buildSrt', () => {
  it('so khớp chuỗi SRT chuẩn với 2 cue mẫu', () => {
    const out = buildSrt([
      { startSec: 0, endSec: 2.5, text: 'Xin chào' },
      { startSec: 3, endSec: 61.234, text: 'Dòng hai' },
    ])
    assert.equal(
      out,
      '1\n00:00:00,000 --> 00:00:02,500\nXin chào\n\n' +
        '2\n00:00:03,000 --> 00:01:01,234\nDòng hai\n',
    )
  })

  it('pad giờ/phút/giây và làm tròn ms', () => {
    const out = buildSrt([{ startSec: 3723.4567, endSec: 3723.9999, text: 'x' }])
    assert.ok(out.includes('01:02:03,457 --> 01:02:04,000'))
  })
})

describe('mp3DurationMs', () => {
  // 1 frame MPEG2 Layer III 48kbps/24kHz, frameLen = floor(72*48000/24000) = 144
  const fakeFrame = () => {
    const f = Buffer.alloc(144)
    f[0] = 0xff
    f[1] = 0xf3 // MPEG2 + Layer III
    f[2] = 0x64 // bitrate idx 6 = 48kbps, samplerate idx 1 = 24kHz, no padding
    f[3] = 0xc0
    return f
  }

  it('ID3v2 + 10 frame 48kbps/24kHz → 240ms', () => {
    const id3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    const mp3 = Buffer.concat([id3, ...Array.from({ length: 10 }, fakeFrame)])
    assert.equal(mp3DurationMs(mp3), 240)
  })

  it('buffer rỗng → 0', () => {
    assert.equal(mp3DurationMs(Buffer.alloc(0)), 0)
  })

  it('garbage → 0 và không treo', () => {
    const g = Buffer.from([0x01, 0x02, 0x03, 0xff, 0xe0, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef])
    const t0 = Date.now()
    assert.equal(mp3DurationMs(g), 0)
    assert.ok(Date.now() - t0 < 1000)
  })

  it('frame có padding bit vẫn parse đúng độ dài', () => {
    const f1 = Buffer.alloc(145)
    f1[0] = 0xff
    f1[1] = 0xf3
    f1[2] = 0x66 // padding bit = 1 → frameLen 145
    f1[3] = 0xc0
    const mp3 = Buffer.concat([f1, fakeFrame()])
    assert.equal(mp3DurationMs(mp3), 48) // 2 frame × 24ms
  })
})
