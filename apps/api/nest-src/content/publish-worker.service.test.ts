import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { computeBackoffMs, decideRetry, probeMediaUrl } from './publish-worker.service'
import { OrhError, detectMediaKind } from '@orh/shared'

describe('computeBackoffMs', () => {
  it('backoff mũ: 30s, 60s, 120s cho attempts 1,2,3', () => {
    assert.equal(computeBackoffMs(1, false), 30_000)
    assert.equal(computeBackoffMs(2, false), 60_000)
    assert.equal(computeBackoffMs(3, false), 120_000)
  })

  it('trần 30 phút', () => {
    assert.equal(computeBackoffMs(100, false), 30 * 60_000)
  })

  it('rate limit → backoff 1h bất kể attempts', () => {
    assert.equal(computeBackoffMs(1, true), 60 * 60_000)
    assert.equal(computeBackoffMs(4, true), 60 * 60_000)
  })
})

describe('decideRetry', () => {
  it('lỗi retryable + còn lượt → retry với delay', () => {
    const d = decideRetry(new OrhError('TRANSIENT_NETWORK_ERROR', 'timeout', true), 1)
    assert.equal(d.kind, 'retry')
    if (d.kind === 'retry') assert.ok(d.delayMs > 0)
  })

  it('lỗi retryable nhưng hết lượt → dead_letter', () => {
    const d = decideRetry(new OrhError('TRANSIENT_NETWORK_ERROR', 'timeout', true), 5)
    assert.deepEqual(d, { kind: 'terminal', status: 'dead_letter' })
  })

  it('lỗi vĩnh viễn (CONTENT_REJECTED) → failed ngay', () => {
    const d = decideRetry(new OrhError('CONTENT_REJECTED', 'bị từ chối', false), 1)
    assert.deepEqual(d, { kind: 'terminal', status: 'failed' })
  })

  it('lỗi không phải OrhError (ví dụ fetch rớt mạng) → retry vì không chứng minh được là vĩnh viễn', () => {
    const d = decideRetry(new Error('unexpected'), 2)
    assert.equal(d.kind, 'retry')
    if (d.kind === 'retry') assert.ok(d.delayMs > 0)
  })

  it('lỗi lạ hết lượt → dead_letter để admin xử lý thủ công', () => {
    const d = decideRetry(new Error('unexpected'), 5)
    assert.deepEqual(d, { kind: 'terminal', status: 'dead_letter' })
  })

  it('RATE_LIMITED → retry với backoff dài khi còn lượt', () => {
    const d = decideRetry(new OrhError('RATE_LIMITED', 'limit', false), 2)
    assert.equal(d.kind, 'retry')
    if (d.kind === 'retry') assert.equal(d.delayMs, 60 * 60_000)
  })

  it('RATE_LIMITED hết lượt → dead_letter', () => {
    const d = decideRetry(new OrhError('RATE_LIMITED', 'limit', false), 5)
    assert.deepEqual(d, { kind: 'terminal', status: 'dead_letter' })
  })
})

describe('detectMediaKind', () => {
  it('đuôi mp4/mov → video', () => {
    assert.equal(detectMediaKind('https://i.ibb.co/abc/clip.mp4'), 'video')
    assert.equal(detectMediaKind('https://x.com/v.MOV?token=1'), 'video')
  })
  it('đuôi ảnh hoặc không rõ → image', () => {
    assert.equal(detectMediaKind('https://i.ibb.co/abc/photo.png'), 'image')
    assert.equal(detectMediaKind('https://x.com/noext'), 'image')
  })
})

describe('probeMediaUrl', () => {
  let server: Server
  let base: string
  before(async () => {
    server = createServer((req, res) => {
      if (req.url === '/a.png') {
        res.writeHead(200, { 'content-type': 'image/png' })
        res.end('fakepng')
      } else if (req.url === '/v.mp4') {
        res.writeHead(200, { 'content-type': 'video/mp4' })
        res.end('fakemp4')
      } else if (req.url === '/page') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<html></html>')
      } else if (req.url === '/gone') {
        res.writeHead(404)
        res.end()
      } else if (req.url === '/nohead') {
        // Không hỗ trợ HEAD → 405, GET range trả content-type thật
        if (req.method === 'HEAD') {
          res.writeHead(405)
          res.end()
        } else {
          res.writeHead(206, { 'content-type': 'image/jpeg' })
          res.end('x')
        }
      } else {
        res.writeHead(500)
        res.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    base = `http://127.0.0.1:${port}`
  })
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('ảnh hợp lệ → image', async () => {
    assert.equal(await probeMediaUrl(`${base}/a.png`), 'image')
  })
  it('video hợp lệ → video', async () => {
    assert.equal(await probeMediaUrl(`${base}/v.mp4`), 'video')
  })
  it('trả về HTML (dán nhầm link trang web) → CONTENT_REJECTED vĩnh viễn', async () => {
    await assert.rejects(probeMediaUrl(`${base}/page`), (err: unknown) => {
      assert.ok(err instanceof OrhError)
      assert.equal(err.code, 'CONTENT_REJECTED')
      assert.equal(err.retryable, false)
      return true
    })
  })
  it('HTTP 404 → CONTENT_REJECTED vĩnh viễn', async () => {
    await assert.rejects(probeMediaUrl(`${base}/gone`), (err: unknown) => {
      assert.ok(err instanceof OrhError)
      assert.equal(err.code, 'CONTENT_REJECTED')
      assert.equal(err.retryable, false)
      return true
    })
  })
  it('host không hỗ trợ HEAD → fallback GET range vẫn probe được', async () => {
    assert.equal(await probeMediaUrl(`${base}/nohead`), 'image')
  })
  it('không kết nối được → TRANSIENT_NETWORK_ERROR retryable', async () => {
    await assert.rejects(probeMediaUrl('http://127.0.0.1:1/none'), (err: unknown) => {
      assert.ok(err instanceof OrhError)
      assert.equal(err.code, 'TRANSIENT_NETWORK_ERROR')
      assert.equal(err.retryable, true)
      return true
    })
  })
})
