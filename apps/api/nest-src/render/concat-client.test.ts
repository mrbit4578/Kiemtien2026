/**
 * Test ConcatClient với fake `concat-cli serve` (TCP server giả lập).
 * Không cần binary Concat thật.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as net from 'net'
import { ConcatClient, loadConcatConfig } from './concat-client'
import { ConcatApiError } from './concat-protocol'

const TOKEN = 'test-token-123'

function startFakeServe(opts: { token?: string } = {}): Promise<{ port: number; close: () => Promise<void>; send: (line: string) => void }> {
  return new Promise((resolve) => {
    let sock: net.Socket | null = null
    let buf = ''
    const server = net.createServer((s) => {
      sock = s
      s.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8')
        let idx: number
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 1)
          if (!line) continue
          const msg = JSON.parse(line) as { id?: number; method?: string; params?: { token?: string } }
          if (msg.method === 'auth') {
            if (msg.params?.token === (opts.token ?? TOKEN)) {
              s.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? 0, result: {} }) + '\n')
            } else {
              s.write(
                JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? 0, error: { code: 'unauthorized', message: 'wrong token' } }) + '\n',
              )
              s.destroy()
            }
            continue
          }
          if (msg.method === 'version') {
            s.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { apiVersion: '0.2', concat: '0.2.3-fake' } }) + '\n')
          } else if (msg.method === 'boom') {
            s.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: 'BadBoom', message: 'bad boom' } }) + '\n')
          }
          // 'slow': không trả lời — để test timeout
        }
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      resolve({
        port,
        send: (line: string) => sock?.write(line),
        close: () => new Promise<void>((r) => { sock?.destroy(); server.close(() => r()) }),
      })
    })
  })
}

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
  return fn().finally(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })
}

describe('loadConcatConfig', () => {
  it('mặc định tắt (fail-closed)', () => {
    const c = loadConcatConfig({} as NodeJS.ProcessEnv)
    assert.equal(c.enabled, false)
    assert.equal(c.autostart, true)
    assert.equal(c.port, 7420)
  })
})

describe('ConcatClient (fake serve)', () => {
  let fake: { port: number; close: () => Promise<void>; send: (line: string) => void }

  before(async () => {
    fake = await startFakeServe()
  })

  after(async () => {
    await fake.close()
  })

  it('auth handshake + gọi version thành công', async () => {
    await withEnv(
      {
        CONCAT_ENABLED: 'true',
        CONCAT_AUTOSTART: 'false',
        CONCAT_API_TOKEN: TOKEN,
        CONCAT_PORT: String(fake.port),
        CONCAT_CONNECT_RETRIES: '3',
      },
      async () => {
        const client = new ConcatClient()
        try {
          const v = (await client.call('version')) as { apiVersion: string }
          assert.equal(v.apiVersion, '0.2')
          assert.ok(client.connected)
        } finally {
          await client.onModuleDestroy()
        }
      },
    )
  })

  it('sai token → từ chối', async () => {
    await withEnv(
      {
        CONCAT_ENABLED: 'true',
        CONCAT_AUTOSTART: 'false',
        CONCAT_API_TOKEN: 'sai-token',
        CONCAT_PORT: String(fake.port),
        CONCAT_CONNECT_RETRIES: '2',
      },
      async () => {
        const client = new ConcatClient()
        try {
          await assert.rejects(() => client.call('version'), /token|unauthorized|Không nối được/i)
        } finally {
          await client.onModuleDestroy()
        }
      },
    )
  })

  it('error response → ConcatApiError mang code', async () => {
    await withEnv(
      {
        CONCAT_ENABLED: 'true',
        CONCAT_AUTOSTART: 'false',
        CONCAT_API_TOKEN: TOKEN,
        CONCAT_PORT: String(fake.port),
        CONCAT_CONNECT_RETRIES: '3',
      },
      async () => {
        const client = new ConcatClient()
        try {
          const err = await client.call('boom').then(
            () => null,
            (e) => e as Error,
          )
          assert.ok(err instanceof ConcatApiError)
          assert.equal((err as ConcatApiError).code, 'BadBoom')
          assert.match(err!.message, /bad boom/)
        } finally {
          await client.onModuleDestroy()
        }
      },
    )
  })

  it('event từ server tới listener', async () => {
    await withEnv(
      {
        CONCAT_ENABLED: 'true',
        CONCAT_AUTOSTART: 'false',
        CONCAT_API_TOKEN: TOKEN,
        CONCAT_PORT: String(fake.port),
        CONCAT_CONNECT_RETRIES: '3',
      },
      async () => {
        const client = new ConcatClient()
        try {
          await client.call('version') // đảm bảo đã nối
          const got = await new Promise<{ m: string; p: Record<string, unknown> }>((resolve) => {
            const off = client.onEvent((m, p) => {
              off()
              resolve({ m, p })
            })
            fake.send('{"jsonrpc":"2.0","method":"export.done","params":{"job":"j9","output":"/o.mp4"}}\n')
          })
          assert.equal(got.m, 'export.done')
          assert.equal(got.p['job'], 'j9')
        } finally {
          await client.onModuleDestroy()
        }
      },
    )
  })

  it('không trả lời → timeout', async () => {
    await withEnv(
      {
        CONCAT_ENABLED: 'true',
        CONCAT_AUTOSTART: 'false',
        CONCAT_API_TOKEN: TOKEN,
        CONCAT_PORT: String(fake.port),
        CONCAT_CONNECT_RETRIES: '3',
      },
      async () => {
        const client = new ConcatClient()
        try {
          await assert.rejects(() => client.call('slow', undefined, 150), /sau 150ms/)
        } finally {
          await client.onModuleDestroy()
        }
      },
    )
  })

  it('tắt (CONCAT_ENABLED != true) → lỗi disabled rõ ràng', async () => {
    await withEnv({ CONCAT_ENABLED: 'false' }, async () => {
      const client = new ConcatClient()
      try {
        await assert.rejects(() => client.call('version'), /chưa được bật/)
      } finally {
        await client.onModuleDestroy()
      }
    })
  })
})
