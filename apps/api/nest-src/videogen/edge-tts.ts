/**
 * edge-tts.ts — client WebSocket tối giản tới Edge TTS (Microsoft, miễn phí,
 * không cần API key), chỉ dùng node builtins (node:https + node:crypto).
 *
 * Cố ý KHÔNG dùng package `ws` (không thêm npm dependency mới).
 */

import { request as httpsRequest } from 'node:https'
import { randomBytes, randomUUID, createHash } from 'node:crypto'

const EDGE_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4-DFD9-6BCC-1300-9C8D-FE4F9ADF7E34'
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const EDGE_TIMEOUT_MS = 60_000

export interface EdgeWord {
  word: string
  startMs: number
  endMs: number
}

export interface EdgeSynthResult {
  audio: Buffer
  words: EdgeWord[]
  durationMs: number
}

type WsMessage = { kind: 'text'; text: string } | { kind: 'binary'; data: Buffer }

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Gói 1 frame WebSocket client → server: FIN + opcode, client PHẢI mask. */
function encodeFrame(opcode: number, data: Buffer): Buffer {
  const maskKey = randomBytes(4)
  const len = data.length
  let header: Buffer
  if (len <= 125) {
    header = Buffer.alloc(2)
    header[1] = 0x80 | len
  } else if (len <= 0xffff) {
    header = Buffer.alloc(4)
    header[1] = 0x80 | 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  header[0] = 0x80 | opcode
  const masked = Buffer.allocUnsafe(len)
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ maskKey[i % 4]
  return Buffer.concat([header, maskKey, masked])
}

/**
 * Parser frame server → client (server không mask).
 * Gom message theo opcode 0x1 (text) / 0x2 (binary), hỗ trợ continuation (0x0).
 * Ping → gọi onPing để trả pong; close → bỏ qua.
 */
class WsParser {
  private buf: Buffer = Buffer.alloc(0)
  private opcode = -1
  private chunks: Buffer[] = []

  feed(
    data: Buffer,
    onMessage: (m: WsMessage) => void,
    onPing: () => void,
  ): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, data]) : data
    for (;;) {
      if (this.buf.length < 2) return
      const b0 = this.buf[0]
      const b1 = this.buf[1]
      const fin = (b0 & 0x80) !== 0
      const opcode = b0 & 0x0f
      let len = b1 & 0x7f
      let off = 2
      if (len === 126) {
        if (this.buf.length < 4) return
        len = this.buf.readUInt16BE(2)
        off = 4
      } else if (len === 127) {
        if (this.buf.length < 10) return
        const big = this.buf.readBigUInt64BE(2)
        if (big > BigInt(0x7fffffff)) throw new Error('Frame WebSocket quá lớn.')
        len = Number(big)
        off = 10
      }
      const masked = (b1 & 0x80) !== 0
      let maskKey: Buffer | null = null
      if (masked) {
        if (this.buf.length < off + 4) return
        maskKey = this.buf.subarray(off, off + 4)
        off += 4
      }
      if (this.buf.length < off + len) return
      let payload: Buffer = this.buf.subarray(off, off + len)
      if (maskKey) {
        const raw = Buffer.allocUnsafe(len)
        for (let i = 0; i < len; i++) raw[i] = payload[i] ^ maskKey[i % 4]
        payload = raw
      }
      this.buf = this.buf.subarray(off + len)

      if (opcode === 0x8) continue // close: bỏ qua
      if (opcode === 0x9) {
        onPing()
        continue
      } // ping → pong
      if (opcode === 0xa) continue // pong
      if (opcode === 0x0) {
        if (this.opcode !== -1) this.chunks.push(payload) // continuation
      } else if (opcode === 0x1 || opcode === 0x2) {
        this.opcode = opcode
        this.chunks = [payload]
      } else {
        continue // opcode lạ: bỏ qua
      }
      if (fin) {
        const data2 = Buffer.concat(this.chunks)
        const op = this.opcode
        this.opcode = -1
        this.chunks = []
        onMessage(
          op === 0x1
            ? { kind: 'text', text: data2.toString('utf8') }
            : { kind: 'binary', data: data2 },
        )
      }
    }
  }
}

/** Tách headers/body của message text Edge ở `\r\n\r\n`. */
function splitEdgeMessage(text: string): { headers: string; body: string } {
  const sep = text.indexOf('\r\n\r\n')
  if (sep === -1) return { headers: text, body: '' }
  return { headers: text.slice(0, sep), body: text.slice(sep + 4) }
}

interface EdgeMetadataItem {
  Type?: string
  Data?: {
    text?: { Text?: string }
    Offset?: number
    Duration?: number
  }
}

/**
 * Tổng hợp giọng đọc 1 đoạn text qua Edge TTS.
 * Trả về MP3 (audio-24khz-48kbitrate-mono-mp3) + word boundaries.
 */
export function synthesizeEdge(
  text: string,
  voiceName: string,
): Promise<EdgeSynthResult> {
  return new Promise<EdgeSynthResult>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(
      () => fail('Edge TTS quá 60 giây chưa trả kết quả — hãy thử lại.'),
      EDGE_TIMEOUT_MS,
    )
    const fail = (msg: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        req.destroy()
      } catch {
        /* bỏ qua */
      }
      reject(new Error(msg))
    }
    const succeed = (r: EdgeSynthResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }

    const wsKey = randomBytes(16).toString('base64')
    const u = new URL(EDGE_URL)
    const req = httpsRequest({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        Host: u.hostname,
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Key': wsKey,
        'Sec-WebSocket-Version': '13',
        Origin: 'https://www.bing.com',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    })
    req.on('error', (err) => fail(`Không kết nối được tới Edge TTS: ${err.message}`))
    req.on('response', (res) =>
      fail(`Edge TTS từ chối handshake (HTTP ${res.statusCode ?? '?'}).`),
    )
    req.on('upgrade', (res, socket) => {
      const expected = createHash('sha1')
        .update(wsKey + WS_MAGIC)
        .digest('base64')
      if (res.headers['sec-websocket-accept'] !== expected) {
        socket.destroy()
        fail('Máy chủ Edge từ chối kết nối WebSocket (Sec-WebSocket-Accept không hợp lệ).')
        return
      }

      const requestId = randomUUID()
      const words: EdgeWord[] = []
      const audioParts: Buffer[] = []
      const parser = new WsParser()
      const sendText = (payload: string) =>
        socket.write(encodeFrame(0x1, Buffer.from(payload, 'utf8')))
      const sendPong = () => socket.write(encodeFrame(0xa, Buffer.alloc(0)))

      const onMessage = (m: WsMessage) => {
        if (m.kind === 'text') {
          const { headers, body } = splitEdgeMessage(m.text)
          if (headers.includes('Path:audio.metadata')) {
            try {
              const meta = JSON.parse(body) as {
                Metadata?: EdgeMetadataItem[]
              }
              for (const md of meta.Metadata ?? []) {
                if (md.Type !== 'WordBoundary') continue
                const offset = Number(md.Data?.Offset ?? 0)
                const dur = Number(md.Data?.Duration ?? 0)
                words.push({
                  word: String(md.Data?.text?.Text ?? ''),
                  startMs: offset / 10000,
                  endMs: (offset + dur) / 10000,
                })
              }
            } catch {
              /* metadata hỏng: bỏ qua */
            }
          } else if (headers.includes('Path:turn.end')) {
            socket.destroy()
            const durationMs = words.length
              ? Math.max(...words.map((w) => w.endMs))
              : 0
            succeed({ audio: Buffer.concat(audioParts), words, durationMs })
          }
        } else {
          // Binary: 2 bytes đầu = độ dài headers (UInt16BE), sau đó là
          // headers + '\r\n\r\n' (4 bytes) rồi tới audio bytes.
          if (m.data.length < 2) return
          const headerLen = m.data.readUInt16BE(0)
          if (m.data.length < 2 + headerLen) return
          const headers = m.data.subarray(2, 2 + headerLen).toString('utf8')
          if (headers.includes('Path:audio')) {
            const audioStart = 2 + headerLen + 4
            if (m.data.length > audioStart) {
              audioParts.push(m.data.subarray(audioStart))
            }
          }
        }
      }

      socket.on('data', (chunk: Buffer) => {
        try {
          parser.feed(chunk, onMessage, sendPong)
        } catch (err) {
          fail(
            `Lỗi đọc dữ liệu từ Edge TTS: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      })
      socket.on('error', (err) => fail(`Kết nối Edge TTS lỗi: ${err.message}`))
      socket.on('close', () => {
        if (!settled) fail('Kết nối Edge TTS bị đóng trước khi nhận đủ audio.')
      })

      // (1) speech.config
      sendText(
        `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n` +
          `\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":true},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
      )
      // (2) ssml
      sendText(
        `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${new Date().toUTCString()}\r\n` +
          `Path:ssml\r\n` +
          `\r\n` +
          `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN">` +
          `<voice name="${voiceName}"><prosody rate="+0%" pitch="+0Hz">${escapeXml(text)}</prosody></voice></speak>`,
      )
    })
    req.end()
  })
}
