import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ToolRegistry,
  validateToolArgs,
  ToolArgError,
  type ToolDefinition,
} from './tool-registry'

const dummyTool: ToolDefinition = {
  name: 'dummy_tool',
  description: 'tool test',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 2, maxLength: 10 },
      limit: { type: 'integer', minimum: 1, maximum: 5 },
      mode: { type: 'string', enum: ['a', 'b'] },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async () => 'ok',
}

describe('validateToolArgs', () => {
  it('chấp nhận args hợp lệ', () => {
    const out = validateToolArgs('dummy_tool', dummyTool.parameters, { query: 'hello', limit: 3 })
    assert.deepEqual(out, { query: 'hello', limit: 3 })
  })

  it('báo thiếu trường bắt buộc', () => {
    assert.throws(
      () => validateToolArgs('dummy_tool', dummyTool.parameters, { limit: 2 }),
      (e: unknown) => e instanceof ToolArgError && e.issues.some((i) => i.includes('query')),
    )
  })

  it('báo sai kiểu', () => {
    assert.throws(
      () => validateToolArgs('dummy_tool', dummyTool.parameters, { query: 123 }),
      (e: unknown) => e instanceof ToolArgError && e.issues.some((i) => i.includes('string')),
    )
  })

  it('báo sai enum và ngoài min/max', () => {
    assert.throws(
      () => validateToolArgs('dummy_tool', dummyTool.parameters, { query: 'ok', mode: 'z' }),
      (e: unknown) => e instanceof ToolArgError,
    )
    assert.throws(
      () => validateToolArgs('dummy_tool', dummyTool.parameters, { query: 'ok', limit: 99 }),
      (e: unknown) => e instanceof ToolArgError,
    )
  })

  it('chặn trường thừa khi additionalProperties=false', () => {
    assert.throws(
      () =>
        validateToolArgs('dummy_tool', dummyTool.parameters, { query: 'ok', injected: 'x' }),
      (e: unknown) => e instanceof ToolArgError && e.issues.some((i) => i.includes('injected')),
    )
  })

  it('ném khi args không phải object', () => {
    assert.throws(() => validateToolArgs('dummy_tool', dummyTool.parameters, 'nope'), ToolArgError)
    assert.throws(() => validateToolArgs('dummy_tool', dummyTool.parameters, null), ToolArgError)
  })
})

describe('ToolRegistry', () => {
  it('đăng ký và tra cứu tool', () => {
    const r = new ToolRegistry()
    r.register(dummyTool)
    assert.equal(r.has('dummy_tool'), true)
    assert.equal(r.get('dummy_tool')?.description, 'tool test')
    assert.deepEqual(r.listNames(), ['dummy_tool'])
  })

  it('từ chối trùng tên và tên sai format', () => {
    const r = new ToolRegistry()
    r.register(dummyTool)
    assert.throws(() => r.register(dummyTool), /đã được đăng ký/)
    assert.throws(
      () => r.register({ ...dummyTool, name: 'Bad-Name!' }),
      /không hợp lệ/,
    )
  })
})
