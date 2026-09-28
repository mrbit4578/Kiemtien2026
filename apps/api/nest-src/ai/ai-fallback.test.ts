import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common'
import { encrypt } from '@orh/crypto'
import { AiService, FALLBACK_PRIORITY } from './ai.service'

// Key mã hóa dùng riêng cho test — KHÔNG liên quan tới production
process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

const auditStub = { log: async () => ({}) } as any

function makeService(prisma: any) {
  return new AiService(prisma, auditStub) as any
}

describe('combo fallback provider', () => {
  it('FALLBACK_PRIORITY: openai → gemini trước experientiallabs', () => {
    assert.equal(FALLBACK_PRIORITY[0], 'openai')
    assert.equal(FALLBACK_PRIORITY[1], 'gemini')
    assert.ok(FALLBACK_PRIORITY.includes('experientiallabs'))
  })

  it('isFallbackableError: chỉ lỗi 5xx mới đáng thử provider khác', () => {
    const svc = makeService({})
    assert.equal(svc.isFallbackableError(new HttpException('p', HttpStatus.BAD_GATEWAY)), true)
    assert.equal(svc.isFallbackableError(new HttpException('p', 500)), true)
    assert.equal(svc.isFallbackableError(new BadRequestException('u')), false)
    assert.equal(svc.isFallbackableError(new Error('boom')), false)
    assert.equal(svc.isFallbackableError(null), false)
  })

  it('chat(): grok lỗi 429 → tự chuyển sang openai, response kèm fallback', async () => {
    const calls: string[] = []
    const svc = makeService({
      aiConnection: {
        findUnique: async () => ({
          id: 'c1',
          provider: 'experientiallabs',
          status: 'active',
          keyCipher: 'enc1',
        }),
        findMany: async () => [
          { id: 'c2', provider: 'openai', status: 'active', keyCipher: 'enc2' },
          { id: 'c3', provider: 'gemini', status: 'active', keyCipher: 'enc3' },
        ],
        update: async () => ({}),
      },
    })
    svc.decryptConnKey = () => 'fake-key'
    svc.runSingleProviderChat = async (_ws: string, meta: any) => {
      calls.push(meta.id)
      if (meta.id === 'experientiallabs') {
        throw new HttpException(
          'ExperientialLabs trả lỗi 429: model_requires_purchase',
          HttpStatus.BAD_GATEWAY,
        )
      }
      return { content: 'ok', model: meta.defaultModel, usage: null, provider: meta.id }
    }

    const res = await svc.chat('ws1', {
      provider: 'experientiallabs',
      messages: [{ role: 'user', content: 'hi' }],
      model: 'grok-4.7',
    })

    assert.deepEqual(calls, ['experientiallabs', 'openai'])
    assert.equal(res.provider, 'openai')
    assert.equal(res.fallback.from, 'experientiallabs')
    assert.equal(res.fallback.to, 'openai')
    assert.match(res.fallback.reason, /429/)
  })

  it('chat(): lỗi 400 (chưa kết nối) → KHÔNG fallback, ném thẳng', async () => {
    let fallbackCalls = 0
    const svc = makeService({
      aiConnection: {
        findUnique: async () => null,
        findMany: async () => {
          fallbackCalls++
          return []
        },
      },
    })
    await assert.rejects(
      () =>
        svc.chat('ws1', {
          provider: 'openai',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      /Chưa kết nối/,
    )
    assert.equal(fallbackCalls, 0)
  })

  it('chat(): không có key dự phòng nào chạy được → ném lỗi gốc của provider chính', async () => {
    const svc = makeService({
      aiConnection: {
        findUnique: async () => ({
          id: 'c1',
          provider: 'experientiallabs',
          status: 'active',
          keyCipher: 'enc1',
        }),
        findMany: async () => [],
        update: async () => ({}),
      },
    })
    svc.decryptConnKey = () => 'fake-key'
    svc.runSingleProviderChat = async () => {
      throw new HttpException('ExperientialLabs trả lỗi 500', HttpStatus.BAD_GATEWAY)
    }
    await assert.rejects(
      () =>
        svc.chat('ws1', {
          provider: 'experientiallabs',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      /trả lỗi 500/,
    )
  })

  it('getEmbeddingKey(): bỏ qua key giải mã lỗi, dùng key còn lại', async () => {
    const goodCipher = encrypt('sk-gemini-real')
    const svc = makeService({
      aiConnection: {
        findMany: async () => [
          { id: 'c1', provider: 'openai', status: 'active', keyCipher: 'garbage-not-encrypted' },
          { id: 'c2', provider: 'gemini', status: 'active', keyCipher: goodCipher },
        ],
      },
    })
    const info = await svc.getEmbeddingKey('ws1')
    assert.equal(info.meta.id, 'gemini')
    assert.equal(info.apiKey, 'sk-gemini-real')
  })

  it('getEmbeddingKey(): mọi key đều giải mã lỗi → ném lỗi TOKEN_ENCRYPTION_KEY', async () => {
    const svc = makeService({
      aiConnection: {
        findMany: async () => [
          { id: 'c1', provider: 'openai', status: 'active', keyCipher: 'bad1' },
        ],
      },
    })
    await assert.rejects(() => svc.getEmbeddingKey('ws1'), /TOKEN_ENCRYPTION_KEY/)
  })

  it('getEmbeddingKey(): chưa có key nào → 400 hướng dẫn vào Cài đặt', async () => {
    const svc = makeService({ aiConnection: { findMany: async () => [] } })
    await assert.rejects(() => svc.getEmbeddingKey('ws1'), /Cài đặt → AI Pro/)
  })
})
