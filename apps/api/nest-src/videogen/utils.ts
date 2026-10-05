/**
 * videogen/utils.ts — hàm thuần tuý (không phụ thuộc NestJS) để dễ unit test.
 */

/** Cắt ```json fence, lấy {...} đầu→cuối */
export function parseJsonLoose(text: string): any {
  const t = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('AI không trả về JSON')
  return JSON.parse(t.slice(first, last + 1))
}

/** PCM 16-bit mono → WAV buffer */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const out = Buffer.alloc(44 + pcm.length)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + pcm.length, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(pcm.length, 40)
  pcm.copy(out, 44)
  return out
}

export function dataUrlParts(dataUrl: string): { mime: string; b64: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '')
  return m ? { mime: m[1], b64: m[2] } : null
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Chia text thành các chunk ≤ maxWords từ, phục vụ TTS hàng loạt.
 * - Tách câu theo /(?<=[.!?…])\s+|\n+/ (giữ dấu câu ở cuối câu).
 * - Gom greedy các câu liên tiếp vào 1 chunk miễn ≤ maxWords.
 * - Câu đơn dài hơn maxWords → chẻ cứng theo từ.
 * - Text rỗng → [].
 */
export function chunkText(text: string, maxWords = 50): string[] {
  const t = (text || '').trim()
  if (!t) return []
  const sentences = t
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const chunks: string[] = []
  let cur: string[] = []
  let curWords = 0
  const flush = () => {
    if (cur.length) chunks.push(cur.join(' '))
    cur = []
    curWords = 0
  }
  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean)
    if (words.length > maxWords) {
      flush()
      for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '))
      }
      continue
    }
    if (cur.length && curWords + words.length > maxWords) flush()
    cur.push(s)
    curWords += words.length
  }
  flush()
  return chunks
}

function fmtSrt(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const p2 = (n: number) => String(n).padStart(2, '0')
  const p3 = (n: number) => String(n).padStart(3, '0')
  return (
    `${p2(Math.floor(ms / 3_600_000))}:` +
    `${p2(Math.floor(ms / 60_000) % 60)}:` +
    `${p2(Math.floor(ms / 1000) % 60)},` +
    p3(ms % 1000)
  )
}

/** Dựng chuỗi SRT chuẩn từ danh sách cue. */
export function buildSrt(
  cues: { startSec: number; endSec: number; text: string }[],
): string {
  return (
    cues
      .map(
        (c, i) =>
          `${i + 1}\n${fmtSrt(c.startSec)} --> ${fmtSrt(c.endSec)}\n${c.text}`,
      )
      .join('\n\n') + '\n'
  )
}

const MP3_BITRATE_L3: Record<string, number[]> = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // dùng cho cả mpeg2.5
}
const MP3_SAMPLERATE: Record<string, number[]> = {
  mpeg1: [44100, 48000, 32000],
  mpeg2: [22050, 24000, 16000],
  mpeg25: [11025, 12000, 8000],
}

/**
 * Ước lượng thời lượng MP3 (ms, làm tròn) bằng cách parse frame header —
 * không cần decoder. Bỏ qua ID3v2, chỉ xử lý Layer III.
 * Buffer rỗng/garbage → 0 (không bao giờ treo).
 */
export function mp3DurationMs(buf: Buffer): number {
  const n = buf.length
  let pos = 0
  // Bỏ qua ID3v2: 'ID3' + 2 bytes version + 1 byte flags + 4 bytes size (synchsafe)
  if (
    n >= 10 &&
    buf[0] === 0x49 &&
    buf[1] === 0x44 &&
    buf[2] === 0x33
  ) {
    const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]
    pos = 10 + size
  }
  let ms = 0
  while (pos + 4 <= n) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++
      continue
    }
    const b1 = buf[pos + 1]
    const b2 = buf[pos + 2]
    const verBits = (b1 >> 3) & 0x3
    const version =
      verBits === 0x3 ? 'mpeg1' : verBits === 0x2 ? 'mpeg2' : verBits === 0x0 ? 'mpeg25' : null
    const layer = (b1 >> 1) & 0x3 // Layer III = 01
    if (!version || layer !== 0x1) {
      pos++
      continue
    }
    const brIdx = (b2 >> 4) & 0xf
    const srIdx = (b2 >> 2) & 0x3
    const padding = (b2 >> 1) & 0x1
    if (brIdx === 0 || brIdx === 15 || srIdx === 3) {
      pos++
      continue
    }
    const bitrateKbps =
      (version === 'mpeg1' ? MP3_BITRATE_L3.mpeg1 : MP3_BITRATE_L3.mpeg2)[brIdx]
    const samplerate = MP3_SAMPLERATE[version][srIdx]
    const coef = version === 'mpeg1' ? 144 : 72
    const frameLen = Math.floor((coef * bitrateKbps * 1000) / samplerate) + padding
    const samplesPerFrame = version === 'mpeg1' ? 1152 : 576
    ms += (samplesPerFrame / samplerate) * 1000
    pos += Math.max(frameLen, 1) // tối thiểu 1 để không treo
  }
  return Math.round(ms)
}
