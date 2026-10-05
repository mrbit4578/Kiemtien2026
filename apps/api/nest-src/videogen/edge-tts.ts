/**
 * edge-tts.ts — client WebSocket tối giản tới Edge TTS (Microsoft, miễn phí,
 * không cần API key), chỉ dùng node builtins (node:tls + node:crypto).
 *
 * Cố ý KHÔNG dùng package `ws` (không thêm npm dependency mới).
 */

import { connect as tlsConnect } from 'node:tls'
import { randomBytes, randomUUID, createHash } from 'node:crypto'

const EDGE_HOST = 'speech.platform.bing.com'
const EDGE_PATH = '/consumer/speech/synthesize/readaloud/edge/v1'
/** Token client tin cậy (dạng không gạch nối, chuẩn thư viện edge-tts). */
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
/**
 * Microsoft yêu cầu Sec-MS-GEC-Version >= 1-133 (thư viện edge-tts hiện dùng
 * 1-143.0.3650.75). Version cũ hơn bị từ chối handshake 401/403.
 */
const SEC_MS_GEC_VERSION = '1-143.0.3650.75'
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
/** Origin của extension Read Aloud — endpoint chỉ chấp nhận Origin giả trình duyệt Edge. */
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const EDGE_TIMEOUT_MS = 60_000
const WIN_EPOCH = 11644473600 // giây từ 1601-01-01 tới 1970-01-01

/**
 * Sinh token Sec-MS-GEC theo đúng thuật toán của thư viện edge-tts
 * (rany2/edge-tts drm.py): SHA256 hex hoa của
 * "<windows file time, làm tròn xuống 5 phút><trusted client token>".
 * Thiếu token này → Microsoft trả 401 ở bước handshake.
 */
function generateSecMsGec(): string {
  let ticks = Date.now() / 1000 // float, giống time.time() của Python
  ticks += WIN_EPOCH
  ticks -= ticks % 300
  ticks *= 10_000_000
  // ticks lúc này luôn là số nguyên (bội của 32 ở độ lớn này) nên Math.round
  // cho kết quả hệt f"{ticks:.0f}" của Python (cả hai đều là float64 IEEE754).
  const strToHash = `${Math.round(ticks)}${TRUSTED_CLIENT_TOKEN}`
  return createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
}

/** MUID ngẫu nhiên cho Cookie, theo headers_with_muid của edge-tts. */
function generateMuid(): string {
  return randomBytes(16).toString('hex').toUpperCase()
}

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
 * Bắt tay WebSocket bằng TLS thô (tự ghi HTTP request, tự đọc 101).
 * Lý do không dùng node:https: server của Microsoft trả
 * `connection: close` (thay vì `connection: upgrade`) trong response 101,
 * khiến Node không emit event 'upgrade' mà emit 'response' — tự làm handshake
 * thì không phụ thuộc vào state machine HTTP của Node.
 */
function doHandshake(): Promise<{
  socket: import('node:net').Socket
}> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (
      fn: () => void,
    ): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      done(() => {
        try {
          socket.destroy()
        } catch {
          /* bỏ qua */
        }
        reject(new Error('Edge TTS quá 15 giây chưa xong handshake — hãy thử lại.'))
      })
    }, 15_000)

    const wsKey = randomBytes(16).toString('base64')
    const connectionId = randomUUID().replace(/-/g, '')
    const path =
      EDGE_PATH +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&ConnectionId=${connectionId}` +
      `&Sec-MS-GEC=${generateSecMsGec()}` +
      `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
    const socket = tlsConnect({ host: EDGE_HOST, port: 443, servername: EDGE_HOST })
    socket.on('error', (err) =>
      done(() => reject(new Error(`Không kết nối được tới Edge TTS: ${err.message}`))),
    )
    let buf: Buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
      const sep = buf.indexOf('\r\n\r\n')
      if (sep === -1) return
      const head = buf.subarray(0, sep).toString('latin1')
      const lines = head.split('\r\n')
      const status = parseInt(lines[0].split(' ')[1] ?? '', 10)
      if (status !== 101) {
        done(() => {
          socket.destroy()
          reject(new Error(`Edge TTS từ chối handshake (HTTP ${Number.isNaN(status) ? '?' : status}).`))
        })
        return
      }
      const headers: Record<string, string> = {}
      for (const line of lines.slice(1)) {
        const i = line.indexOf(':')
        if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
      }
      const expected = createHash('sha1').update(wsKey + WS_MAGIC).digest('base64')
      if (headers['sec-websocket-accept'] !== expected) {
        done(() => {
          socket.destroy()
          reject(new Error('Máy chủ Edge từ chối kết nối WebSocket (Sec-WebSocket-Accept không hợp lệ).'))
        })
        return
      }
      const rest = buf.subarray(sep + 4)
      socket.removeAllListeners('data')
      if (rest.length) socket.unshift(rest) // byte frame WS có thể đã về chung với headers
      done(() => resolve({ socket }))
    })
    const lines = [
      `GET ${path} HTTP/1.1`,
      `Host: ${EDGE_HOST}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${wsKey}`,
      'Sec-WebSocket-Version: 13',
      'Pragma: no-cache',
      'Cache-Control: no-cache',
      `Origin: ${EDGE_ORIGIN}`,
      'Accept-Encoding: gzip, deflate, br, zstd',
      'Accept-Language: en-US,en;q=0.9',
      `Cookie: muid=${generateMuid()};`,
      `User-Agent: ${EDGE_UA}`,
    ]
    socket.write(lines.join('\r\n') + '\r\n\r\n')
  })
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
        socketRef?.destroy()
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

    let socketRef: import('node:net').Socket | null = null
    doHandshake().then(
      ({ socket }) => {
        if (settled) {
          socket.destroy()
          return
        }
        socketRef = socket
        onSocket(socket)
      },
      (err) => fail(err instanceof Error ? err.message : String(err)),
    )

    const onSocket = (socket: import('node:net').Socket) => {

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
    }
  })
}
