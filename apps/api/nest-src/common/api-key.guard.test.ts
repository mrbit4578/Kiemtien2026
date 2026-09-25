import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { UnauthorizedException } from '@nestjs/common'
import {
  parseApiKeys,
  apiKeyMatches,
  lookupApiKey,
  ApiKeyGuard,
} from './api-key.guard'

const OLD_ENV = process.env.INTEGRATION_API_KEYS
afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.INTEGRATION_API_KEYS
  else process.env.INTEGRATION_API_KEYS = OLD_ENV
})

function fakeContext(req: any): any {
  return { switchToHttp: () => ({ getRequest: () => req }) }
}

describe('parseApiKeys', () => {
  it('undefined/rỗng → mảng rỗng', () => {
    assert.deepEqual(parseApiKeys(undefined), [])
    assert.deepEqual(parseApiKeys(''), [])
    assert.deepEqual(parseApiKeys('   '), [])
  })

  it('parse đúng 1 entry name:key:workspaceId', () => {
    assert.deepEqual(parseApiKeys('make:abc123:ws_1'), [
      { name: 'make', key: 'abc123', workspaceId: 'ws_1' },
    ])
  })

  it('parse nhiều entry cách nhau dấu phẩy, chịu khoảng trắng', () => {
    assert.deepEqual(parseApiKeys('make:aaa:ws1 , zapier:bbb:ws2'), [
      { name: 'make', key: 'aaa', workspaceId: 'ws1' },
      { name: 'zapier', key: 'bbb', workspaceId: 'ws2' },
    ])
  })

  it('bỏ qua entry sai định dạng thay vì crash', () => {
    assert.deepEqual(parseApiKeys('make:aaa:ws1,xxx,không-đủ,make2::ws3'), [
      { name: 'make', key: 'aaa', workspaceId: 'ws1' },
    ])
  })
})

describe('apiKeyMatches', () => {
  it('key trùng → true', () => {
    assert.equal(apiKeyMatches('secret-key', 'secret-key'), true)
  })

  it('key khác → false', () => {
    assert.equal(apiKeyMatches('secret-key', 'secret-keY'), false)
  })

  it('độ dài khác nhau → false (không throw timingSafeEqual)', () => {
    assert.equal(apiKeyMatches('short', 'a-much-longer-presented-key'), false)
  })
})

describe('ApiKeyGuard', () => {
  it('không có header X-API-Key → cho qua, không động vào session', () => {
    process.env.INTEGRATION_API_KEYS = 'make:k1:ws1'
    const guard = new ApiKeyGuard()
    const req: any = { headers: {}, session: {} }
    assert.equal(guard.canActivate(fakeContext(req)), true)
    assert.deepEqual(req.session, {})
  })

  it('key hợp lệ → tiêm workspaceId vào session + gắn apiKeyName', () => {
    process.env.INTEGRATION_API_KEYS = 'make:deadbeef:ws_42'
    const guard = new ApiKeyGuard()
    const req: any = { headers: { 'x-api-key': 'deadbeef' }, session: {} }
    assert.equal(guard.canActivate(fakeContext(req)), true)
    assert.equal(req.session.workspaceId, 'ws_42')
    assert.equal(req.apiKeyName, 'make')
  })

  it('key sai → 401 Unauthorized (fail-closed)', () => {
    process.env.INTEGRATION_API_KEYS = 'make:deadbeef:ws_42'
    const guard = new ApiKeyGuard()
    const req: any = { headers: { 'x-api-key': 'sai-key' }, session: {} }
    assert.throws(() => guard.canActivate(fakeContext(req)), UnauthorizedException)
  })

  it('có header nhưng server chưa cấu hình key nào → 401', () => {
    delete process.env.INTEGRATION_API_KEYS
    const guard = new ApiKeyGuard()
    const req: any = { headers: { 'x-api-key': 'deadbeef' }, session: {} }
    assert.throws(() => guard.canActivate(fakeContext(req)), UnauthorizedException)
  })
})

describe('lookupApiKey', () => {
  it('tìm đúng entry theo key', () => {
    const entries = parseApiKeys('make:aaa:ws1,zapier:bbb:ws2')
    assert.equal(lookupApiKey(entries, 'bbb')?.name, 'zapier')
    assert.equal(lookupApiKey(entries, 'zzz'), undefined)
  })
})
