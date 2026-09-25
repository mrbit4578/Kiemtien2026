import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import { createHmac } from 'crypto'
import { PublishWebhookService, signPayload } from './publish-webhook.service'

const OLD_URL = process.env.MAKE_WEBHOOK_URL
const OLD_SECRET = process.env.MAKE_WEBHOOK_SECRET
afterEach(() => {
  if (OLD_URL === undefined) delete process.env.MAKE_WEBHOOK_URL
  else process.env.MAKE_WEBHOOK_URL = OLD_URL
  if (OLD_SECRET === undefined) delete process.env.MAKE_WEBHOOK_SECRET
  else process.env.MAKE_WEBHOOK_SECRET = OLD_SECRET
})

describe('signPayload', () => {
  it('đúng vector HMAC-SHA256 chuẩn', () => {
    // Test vector kinh điển: HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
    assert.equal(
      signPayload('key', 'The quick brown fox jumps over the lazy dog'),
      'sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
  })

  it('khớp với createHmac trực tiếp', () => {
    const body = JSON.stringify({ event: 'publish.failed', jobId: 'j1' })
    const expected =
      'sha256=' + createHmac('sha256', 's3cr3t').update(body, 'utf8').digest('hex')
    assert.equal(signPayload('s3cr3t', body), expected)
  })
})

describe('PublishWebhookService.notify', () => {
  let server: Server
  let received: { headers: Record<string, string | string[] | undefined>; body: string } | null
  let port: number

  before(async () => {
    received = null
    server = createServer((req: IncomingMessage, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received = { headers: { ...req.headers }, body }
        res.writeHead(200)
        res.end('ok')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    port = (server.address() as { port: number }).port
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('chưa cấu hình URL → resolve ngay, không làm gì', async () => {
    delete process.env.MAKE_WEBHOOK_URL
    const svc = new PublishWebhookService()
    await svc.notify('publish.succeeded', {
      jobId: 'j1',
      contentId: 'c1',
      workspaceId: 'ws1',
      platform: 'instagram',
      status: 'done',
    })
    assert.equal(received, null)
  })

  it('gửi đúng payload + header chữ ký HMAC', async () => {
    process.env.MAKE_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`
    process.env.MAKE_WEBHOOK_SECRET = 'wh-secret'
    const svc = new PublishWebhookService()
    await svc.notify('publish.failed', {
      jobId: 'job-9',
      contentId: 'c-9',
      workspaceId: 'ws-9',
      platform: 'tiktok',
      status: 'dead_letter',
      error: 'RATE_LIMITED: quota hết',
    })
    assert.ok(received, 'server phải nhận được request')
    const body = JSON.parse(received!.body)
    assert.equal(body.event, 'publish.failed')
    assert.equal(body.jobId, 'job-9')
    assert.equal(body.platform, 'tiktok')
    assert.equal(body.status, 'dead_letter')
    assert.equal(body.error, 'RATE_LIMITED: quota hết')
    assert.ok(typeof body.at === 'string' && body.at.length > 0)
    // Chữ ký phải verify được bằng secret
    assert.equal(received!.headers['x-kt-signature'], signPayload('wh-secret', received!.body))
    assert.match(String(received!.headers['content-type']), /application\/json/)
  })

  it('không có secret → vẫn gửi, chỉ thiếu header chữ ký', async () => {
    process.env.MAKE_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`
    delete process.env.MAKE_WEBHOOK_SECRET
    received = null
    const svc = new PublishWebhookService()
    await svc.notify('publish.succeeded', {
      jobId: 'j2',
      contentId: null,
      workspaceId: 'ws1',
      platform: 'facebook',
      status: 'done',
      platformPostId: 'fb_123',
    })
    assert.ok(received)
    assert.equal(received!.headers['x-kt-signature'], undefined)
    assert.equal(JSON.parse(received!.body).platformPostId, 'fb_123')
  })

  it('webhook chết (connection refused) → KHÔNG throw, worker an toàn', async () => {
    // Port 1 gần như chắc chắn không có gì listen → refused ngay
    process.env.MAKE_WEBHOOK_URL = 'http://127.0.0.1:1/hook'
    const svc = new PublishWebhookService()
    await svc.notify('publish.failed', {
      jobId: 'jx',
      contentId: 'cx',
      workspaceId: 'wsx',
      platform: 'instagram',
      status: 'failed',
      error: 'boom',
    })
    // resolve được tới đây = không throw sau 3 lần thử
  })
})
