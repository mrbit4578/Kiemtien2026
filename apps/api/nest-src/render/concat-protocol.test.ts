import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  authLine,
  requestLine,
  parseLine,
  splitLines,
  ConcatApiError,
  ConcatProtocolError,
} from './concat-protocol'

describe('authLine', () => {
  it('dòng đầu tiên là auth mang token, kết thúc bằng \\n', () => {
    const line = authLine(0, 'secret-token')
    assert.ok(line.endsWith('\n'))
    const obj = JSON.parse(line)
    assert.equal(obj.jsonrpc, '2.0')
    assert.equal(obj.id, 0)
    assert.equal(obj.method, 'auth')
    assert.equal(obj.params.token, 'secret-token')
  })
})

describe('requestLine', () => {
  it('envelope JSON-RPC đủ id/method/params', () => {
    const obj = JSON.parse(requestLine(7, 'export.run', { path: '/p', output: '/o.mp4' }))
    assert.equal(obj.jsonrpc, '2.0')
    assert.equal(obj.id, 7)
    assert.equal(obj.method, 'export.run')
    assert.deepEqual(obj.params, { path: '/p', output: '/o.mp4' })
  })

  it('không có params thì bỏ key params', () => {
    const obj = JSON.parse(requestLine(1, 'version'))
    assert.ok(!('params' in obj))
  })
})

describe('parseLine', () => {
  it('response result theo id', () => {
    const p = parseLine('{"jsonrpc":"2.0","id":3,"result":{"job":"j1"}}')
    assert.equal(p.kind, 'response')
    if (p.kind === 'response') {
      assert.equal(p.id, 3)
      assert.deepEqual(p.result, { job: 'j1' })
    }
  })

  it('response error → ConcatApiError mang code', () => {
    const p = parseLine('{"jsonrpc":"2.0","id":4,"error":{"code":"Busy","message":"đang bận"}}')
    assert.equal(p.kind, 'response')
    if (p.kind === 'response' && p.error) {
      const err = new ConcatApiError(p.error.code, p.error.message)
      assert.equal(err.code, 'Busy')
      assert.match(err.message, /đang bận/)
    } else assert.fail('phải là error response')
  })

  it('event: có method, không id', () => {
    const p = parseLine('{"jsonrpc":"2.0","method":"export.done","params":{"job":"j1","output":"/o.mp4"}}')
    assert.equal(p.kind, 'event')
    if (p.kind === 'event') {
      assert.equal(p.method, 'export.done')
      assert.equal(p.params['job'], 'j1')
    }
  })

  it('dòng không phải JSON → ConcatProtocolError', () => {
    assert.throws(() => parseLine('not json'), ConcatProtocolError)
  })

  it('dòng không phải response/event → ConcatProtocolError', () => {
    assert.throws(() => parseLine('{"jsonrpc":"2.0","foo":1}'), ConcatProtocolError)
  })
})

describe('splitLines', () => {
  it('tách dòng, giữ phần dở', () => {
    const { lines, rest } = splitLines('{"a":1}\n{"b":2}\n{"c":')
    assert.deepEqual(lines, ['{"a":1}', '{"b":2}'])
    assert.equal(rest, '{"c":')
  })

  it('bỏ dòng trống và \\r', () => {
    const { lines, rest } = splitLines('\n{"a":1}\r\n')
    assert.deepEqual(lines, ['{"a":1}'])
    assert.equal(rest, '')
  })
})
