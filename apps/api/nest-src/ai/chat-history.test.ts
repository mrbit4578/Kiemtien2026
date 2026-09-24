import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NotFoundException } from '@nestjs/common'
import { ChatHistoryService } from './chat-history.service'
import { DEFAULT_SESSION_TITLE } from './dto'

function makeService() {
  const store = {
    sessions: [] as any[],
    messages: [] as any[],
  }
  let seq = 0
  const nid = (p: string) => `${p}${++seq}`
  const prisma = {
    chatSession: {
      findFirst: async ({ where }: any) =>
        store.sessions.find((s) => s.id === where.id && s.workspaceId === where.workspaceId) ?? null,
      findMany: async ({ where }: any) =>
        store.sessions.filter((s) => s.workspaceId === where.workspaceId),
      create: async ({ data }: any) => {
        const s = { id: nid('s'), createdAt: new Date(), updatedAt: new Date(), ...data }
        store.sessions.push(s)
        return s
      },
      update: async ({ where, data }: any) => {
        const s = store.sessions.find((x) => x.id === where.id)
        Object.assign(s, data)
        return s
      },
      delete: async ({ where }: any) => {
        store.sessions = store.sessions.filter((x) => x.id !== where.id)
      },
      deleteMany: async ({ where }: any) => {
        const n = store.sessions.filter((x) => x.workspaceId === where.workspaceId).length
        store.sessions = store.sessions.filter((x) => x.workspaceId !== where.workspaceId)
        return { count: n }
      },
    },
    chatMessage: {
      findMany: async ({ where }: any) =>
        store.messages.filter((m) => m.sessionId === where.sessionId),
      findFirst: async ({ where }: any) =>
        store.messages.find((m) => m.id === where.id && m.sessionId === where.sessionId) ?? null,
      create: async ({ data }: any) => {
        const m = { id: nid('m'), createdAt: new Date(), ...data }
        store.messages.push(m)
        return m
      },
      createMany: async ({ data }: any) => {
        for (const d of data) store.messages.push({ id: nid('m'), createdAt: new Date(), ...d })
        return { count: data.length }
      },
      delete: async ({ where }: any) => {
        store.messages = store.messages.filter((m) => m.id !== where.id)
      },
      deleteMany: async ({ where }: any) => {
        const ids: string[] =
          typeof where.sessionId === 'string' ? [where.sessionId] : where.sessionId.in
        const n = store.messages.filter((m) => ids.includes(m.sessionId)).length
        store.messages = store.messages.filter((m) => !ids.includes(m.sessionId))
        return { count: n }
      },
    },
  } as any
  const audit = { log: async () => ({}) } as any
  return { svc: new ChatHistoryService(prisma, audit), store }
}

describe('ChatHistoryService', () => {
  let svc: ChatHistoryService
  beforeEach(() => {
    svc = makeService().svc
  })

  it('tạo phiên → lưu tin nhắn → tự đặt tiêu đề từ tin nhắn đầu', async () => {
    const s = await svc.createSession('ws1', { provider: 'openai' } as any)
    assert.equal(s.title, DEFAULT_SESSION_TITLE)
    const r = await svc.appendMessages('ws1', s.id, [
      { role: 'user', content: 'Cách làm video viral TikTok?' },
      { role: 'assistant', content: 'Đây là cách…' },
    ])
    assert.equal(r.title, 'Cách làm video viral TikTok?')
    const detail = await svc.getSession('ws1', s.id)
    assert.equal(detail.messages.length, 2)
    assert.equal(detail.messages[0].role, 'user')
  })

  it('getSession của workspace khác → 404', async () => {
    const s = await svc.createSession('ws1', { provider: 'gemini' } as any)
    await assert.rejects(() => svc.getSession('ws2', s.id), NotFoundException)
    await assert.rejects(
      () => svc.appendMessages('ws2', s.id, [{ role: 'user', content: 'hi' }]),
      NotFoundException,
    )
  })

  it('xóa 1 tin nhắn và xóa 1 phiên', async () => {
    const s = await svc.createSession('ws1', { provider: 'openai' } as any)
    await svc.appendMessages('ws1', s.id, [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ])
    let detail = await svc.getSession('ws1', s.id)
    const msgId = detail.messages[0].id
    await svc.deleteMessage('ws1', s.id, msgId)
    detail = await svc.getSession('ws1', s.id)
    assert.equal(detail.messages.length, 1)
    await svc.deleteSession('ws1', s.id)
    await assert.rejects(() => svc.getSession('ws1', s.id), NotFoundException)
  })

  it('xóa toàn bộ lịch sử', async () => {
    const a = await svc.createSession('ws1', { provider: 'openai' } as any)
    const b = await svc.createSession('ws1', { provider: 'gemini' } as any)
    await svc.appendMessages('ws1', a.id, [{ role: 'user', content: 'x' }])
    await svc.appendMessages('ws1', b.id, [{ role: 'user', content: 'y' }])
    const r = await svc.clearAll('ws1')
    assert.equal(r.deletedSessions, 2)
    assert.equal(r.deletedMessages, 2)
    assert.deepEqual(await svc.listSessions('ws1'), [])
  })

  it('đổi tiêu đề', async () => {
    const s = await svc.createSession('ws1', { provider: 'openai' } as any)
    const renamed = await svc.renameSession('ws1', s.id, 'Kế hoạch tuần')
    assert.equal(renamed.title, 'Kế hoạch tuần')
  })
})
