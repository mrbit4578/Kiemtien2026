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
