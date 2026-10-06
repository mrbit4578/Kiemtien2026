import 'reflect-metadata'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HttpException, HttpStatus } from '@nestjs/common'
import { getProviderMeta } from '../ai/ai.providers'
import { AgentService } from './agent.service'

process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

// eslint-disable-next-line @typescript-eslint/no-var-requires
declare const require: (id: string) => any

const compiledDir = () => process.env.VTEST_DIR as string

/** Patch runAgent của agent-loop (CJS module.exports — patch được qua require). */
function patchRunAgent(impl: (callIndex: number) => Promise<any>) {
  const loop = require(`${compiledDir()}/agent/agent-loop.js`)
  let calls = 0
  const orig = loop.runAgent
  loop.runAgent = (...args: any[]) => impl(calls++)
  return () => {
    loop.runAgent = orig
  }
}

/** Dựng AgentService với deps giả. */
function makeService(keys: Record<string, { apiKey: string; connId: string } | null>) {
  const aiService = {
    getChatKey: async (_workspaceId: string, id: string) => {
      const k = keys[id]
      if (!k) throw new HttpException(`Chưa kết nối ${id}`, HttpStatus.BAD_REQUEST)
      return { meta: getProviderMeta(id as any)!, apiKey: k.apiKey, connId: k.connId }
    },
  }
  const prisma = { aiConnection: { update: async () => ({}) } }
  const audit = { log: async () => ({}) }
  const svc: any = new (AgentService as any)(aiService, {}, prisma, audit, {}, {}, {})
  // Registry rỗng — không cần tool thật cho test fallback
  svc.buildRegistry = async () => ({ list: () => [], has: () => false })
  svc.buildBackend = () => ({ label: 'fake-backend' })
  return svc
}

const okResult = (content: string) => ({
  content,
  turns: 1,
  stoppedReason: 'done',
  toolCalls: [],
})

describe('agent combo fallback khi chạy (429/5xx giữa chừng)', () => {
  it('VyceAI 504 → tự chuyển sang OpenAI, response kèm fallback', async (t) => {
    const restore = patchRunAgent(async (i) => {
      if (i === 0) throw new Error('Provider trả lỗi 504: <!DOCTYPE html><html>gateway timeout')
      return okResult('ok từ openai')
    })
    t.after(restore)
    const svc = makeService({
      vyceai: { apiKey: 'v-key', connId: 'c-vyceai' },
      openai: { apiKey: 'o-key', connId: 'c-openai' },
    })
    const res = await svc.run('ws1', {
      provider: 'vyceai',
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(res.provider, 'openai')
    assert.deepEqual(res.fallback, { from: 'vyceai', to: 'openai' })
    assert.equal(res.content, 'ok từ openai')
  })

  it('429 cũng fallback; bỏ qua provider chưa kết nối', async (t) => {
    const restore = patchRunAgent(async (i) => {
      if (i === 0) throw new Error('Provider trả lỗi 429: {"error":{"message":"Too many requests"}}')
      return okResult('ok từ gemini')
    })
    t.after(restore)
    const svc = makeService({
      vyceai: { apiKey: 'v-key', connId: 'c-vyceai' },
      // FALLBACK_PRIORITY: openai trước gemini — openai chưa kết nối → bỏ qua → gemini
      gemini: { apiKey: 'g-key', connId: 'c-gemini' },
    })
    const res = await svc.run('ws1', {
      provider: 'vyceai',
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(res.provider, 'gemini')
    assert.deepEqual(res.fallback, { from: 'vyceai', to: 'gemini' })
  })

  it('hết provider dự phòng → báo lỗi rõ, không treo', async (t) => {
    const restore = patchRunAgent(async () => {
      throw new Error('Provider trả lỗi 503: service unavailable')
    })
    t.after(restore)
    const svc = makeService({ vyceai: { apiKey: 'v-key', connId: 'c-vyceai' } })
    await assert.rejects(
      () => svc.run('ws1', { provider: 'vyceai', messages: [{ role: 'user', content: 'hi' }] }),
      /Agent chạy lỗi qua VyceAI/,
    )
  })

  it('lỗi user (tool không tồn tại) → KHÔNG fallback, báo thẳng', async (t) => {
    const restore = patchRunAgent(async () => okResult('x'))
    t.after(restore)
    const svc = makeService({
      vyceai: { apiKey: 'v-key', connId: 'c-vyceai' },
      openai: { apiKey: 'o-key', connId: 'c-openai' },
    })
    await assert.rejects(
      () =>
        svc.run('ws1', {
          provider: 'vyceai',
          messages: [{ role: 'user', content: 'hi' }],
          tools: ['tool_khong_ton_tai'],
        }),
      /Tool không tồn tại/,
    )
  })
})
