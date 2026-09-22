import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'
import {
  resolveSafeEndpoint,
  assertSafeUrl,
  SsrfBlockedError,
  fetchPinnedText,
  fetchPinnedWithRedirects,
  fetchTimeout,
  redactUrlSecrets,
  type SafeEndpoint,
} from './safe-fetch'

describe('resolveSafeEndpoint', () => {
  it('chấp nhận IP công cộng dạng literal và pin đúng IP', async () => {
    const ep = await resolveSafeEndpoint('http://93.184.216.34/')
    assert.equal(ep.address, '93.184.216.34')
    assert.equal(ep.family, 4)
    assert.equal(ep.url.hostname, '93.184.216.34')
  })

  it('chặn IP nội bộ dạng literal (không cần DNS)', async () => {
    await assert.rejects(() => resolveSafeEndpoint('http://127.0.0.1/'), SsrfBlockedError)
    await assert.rejects(() => resolveSafeEndpoint('http://10.0.0.1/'), SsrfBlockedError)
    await assert.rejects(() => resolveSafeEndpoint('http://169.254.169.254/'), SsrfBlockedError)
  })

  it('assertSafeUrl vẫn tương thích ngược', async () => {
    const url = await assertSafeUrl('https://93.184.216.34/x')
    assert.equal(url.protocol, 'https:')
  })
})

describe('redactUrlSecrets', () => {
  it('che query param nhạy cảm, giữ param thường', () => {
    const out = redactUrlSecrets('https://x.com/cb?code=abc123&state=xyz&token=sek')
    assert.match(out, /code=%5Bredacted%5D|code=\[redacted\]/)
    assert.match(out, /token=\[redacted\]|token=%5Bredacted%5D/)
    assert.match(out, /state=xyz/)
    assert.doesNotMatch(out, /abc123/)
    assert.doesNotMatch(out, /sek/)
  })

  it('giữ nguyên URL không có secret', () => {
    const u = 'https://example.com/a?b=c'
    assert.equal(redactUrlSecrets(u), u)
  })

  it('passthrough chuỗi không phải URL', () => {
    assert.equal(redactUrlSecrets('not a url'), 'not a url')
  })
})

// ─── Local HTTP server cho test transport ────────────────────────────────────

let server: Server
let port: number

function ep(path: string, address = '127.0.0.1'): SafeEndpoint {
  // Bypass guard (127.0.0.1 bị chặn) để test thuần transport;
  // dùng hostname 'localhost' để chứng minh DNS pinning ép về IP đã duyệt.
  return { url: new URL(`http://localhost:${port}${path}`), address, family: 4 }
}

before(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/ok') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end('<html><body>Hello</body></html>')
    } else if (req.url === '/redir') {
      res.writeHead(302, { location: '/ok' })
      res.end()
    } else if (req.url === '/redir-evil') {
      res.writeHead(302, { location: 'http://169.254.169.254/' })
      res.end()
    } else if (req.url === '/big') {
      res.setHeader('content-type', 'text/plain')
      res.end('x'.repeat(100))
    } else if (req.url === '/slow') {
      // không bao giờ trả lời — test timeout
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})

after(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

describe('fetchPinnedText', () => {
  it('GET thành công qua DNS pinning (hostname localhost → ép IP 127.0.0.1)', async () => {
    const res = await fetchPinnedText(ep('/ok'), { timeoutMs: 5000, maxBytes: 10000 })
    assert.equal(res.status, 200)
    assert.match(res.contentType, /text\/html/)
    assert.match(res.text, /Hello/)
    assert.equal(res.truncated, false)
  })

  it('không follow redirect ở tầng transport — trả location', async () => {
    const res = await fetchPinnedText(ep('/redir'), { timeoutMs: 5000, maxBytes: 10000 })
    assert.equal(res.status, 302)
    assert.equal(res.location, '/ok')
    assert.equal(res.text, '')
  })

  it('cắt body vượt maxBytes', async () => {
    const res = await fetchPinnedText(ep('/big'), { timeoutMs: 5000, maxBytes: 10 })
    assert.equal(res.truncated, true)
    assert.ok(res.text.length <= 10)
  })

  it('timeout thật sự reject (không treo)', async () => {
    await assert.rejects(
      fetchPinnedText(ep('/slow'), { timeoutMs: 300, maxBytes: 10000 }),
      /thời gian chờ/,
    )
  })
})

describe('fetchPinnedWithRedirects', () => {
  it('fail-closed ngay hop đầu nếu URL gốc không an toàn', async () => {
    await assert.rejects(
      fetchPinnedWithRedirects('http://169.254.169.254/', {
        timeoutMs: 5000,
        maxBytes: 10000,
      }),
      SsrfBlockedError,
    )
  })

  it('mỗi hop redirect đều được re-validate (không chỉ hop đầu)', () => {
    // Không có hostname public nào resolve về loopback trong môi trường test,
    // nên kiểm tra ở mức cấu trúc: vòng lặp hop phải gọi resolveSafeEndpoint
    // cho URL mới sau mỗi lần redirect — chống redirect-chain SSRF.
    // (Chuẩn hoá whitespace vì transpiler có thể minify source.)
    const src = fetchPinnedWithRedirects.toString().replace(/\s+/g, ' ')
    const loopStart = src.indexOf('for (let hop')
    const loopStartMin = src.indexOf('for(let hop')
    const start = loopStart >= 0 ? loopStart : loopStartMin
    assert.ok(start >= 0, 'tìm thấy vòng lặp hop')
    const loopBody = src.slice(start)
    assert.ok(
      loopBody.includes('resolveSafeEndpoint(current)'),
      'mọi hop đều phải qua resolveSafeEndpoint',
    )
  })
})

describe('fetchTimeout', () => {
  it('resolve bình thường khi server nhanh', async () => {
    const res = await fetchTimeout(`http://127.0.0.1:${port}/ok`, {}, 5000)
    assert.equal(res.status, 200)
    await res.arrayBuffer()
  })

  it('reject đúng hẹn khi server treo', async () => {
    const start = Date.now()
    await assert.rejects(fetchTimeout(`http://127.0.0.1:${port}/slow`, {}, 300), /thời gian chờ/)
    assert.ok(Date.now() - start < 5000, 'phải settle nhanh, không treo')
  })
})
