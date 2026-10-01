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

/** Tool có schema lồng nhau (kaizen A02) — mô phỏng tool dựng video với mảng clips. */
const nestedTool: ToolDefinition = {
  name: 'make_video',
  description: 'tool test nested',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1 },
      clips: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', minLength: 1 },
            duration: { type: 'number', minimum: 1, maximum: 60 },
          },
          required: ['source'],
          additionalProperties: false,
        },
      },
      options: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['mp4', 'webm'] },
        },
        additionalProperties: false,
      },
    },
    required: ['title', 'clips'],
    additionalProperties: false,
  },
  execute: async () => 'ok',
}

describe('validateToolArgs (nested — kaizen A02)', () => {
  const good = {
    title: 't',
    clips: [{ source: 'a.mp4', duration: 5 }],
    options: { format: 'mp4' },
  }

  it('chấp nhận args lồng nhau hợp lệ', () => {
    assert.deepEqual(validateToolArgs('make_video', nestedTool.parameters, good), good)
  })

  it('báo sai kiểu ở phần tử mảng lồng nhau (clips[0].source)', () => {
    assert.throws(
      () =>
        validateToolArgs('make_video', nestedTool.parameters, {
          title: 't',
          clips: [{ source: 123 }],
        }),
      (e: unknown) =>
        e instanceof ToolArgError && e.issues.some((i) => i.includes('clips[0].source')),
    )
  })

  it('báo thiếu trường bắt buộc trong object lồng nhau', () => {
    assert.throws(
      () =>
        validateToolArgs('make_video', nestedTool.parameters, {
          title: 't',
          clips: [{}],
        }),
      (e: unknown) =>
        e instanceof ToolArgError && e.issues.some((i) => i.includes('clips[0].source')),
    )
  })

  it('chặn trường thừa trong object lồng nhau (additionalProperties=false)', () => {
    assert.throws(
      () =>
        validateToolArgs('make_video', nestedTool.parameters, {
          title: 't',
          clips: [{ source: 'a', injected: 1 }],
        }),
      (e: unknown) =>
        e instanceof ToolArgError && e.issues.some((i) => i.includes('clips[0].injected')),
    )
  })

  it('báo enum và min/max ở cấp lồng nhau', () => {
    assert.throws(
      () =>
        validateToolArgs('make_video', nestedTool.parameters, {
          title: 't',
          clips: [{ source: 'a' }],
          options: { format: 'avi' },
        }),
      (e: unknown) =>
        e instanceof ToolArgError && e.issues.some((i) => i.includes('options.format')),
    )
    assert.throws(
      () =>
        validateToolArgs('make_video', nestedTool.parameters, {
          title: 't',
          clips: [{ source: 'a', duration: 999 }],
        }),
      (e: unknown) =>
        e instanceof ToolArgError && e.issues.some((i) => i.includes('clips[0].duration')),
    )
  })

  it('báo minItems/maxItems của mảng', () => {
    assert.throws(
      () => validateToolArgs('make_video', nestedTool.parameters, { title: 't', clips: [] }),
      (e: unknown) => e instanceof ToolArgError && e.issues.some((i) => i.includes('clips')),
    )
    assert.throws(
      () =>
        validateToolArgs('make_video', nestedTool.parameters, {
          title: 't',
          clips: [{ source: 'a' }, { source: 'b' }, { source: 'c' }, { source: 'd' }],
        }),
      (e: unknown) => e instanceof ToolArgError && e.issues.some((i) => i.includes('clips')),
    )
  })

  it('liệt kê MỌI lỗi lồng nhau trong một lần validate', () => {
    try {
      validateToolArgs('make_video', nestedTool.parameters, {
        title: 't',
        clips: [{ duration: 999 }, { source: 1 }],
      })
      assert.fail('phải ném ToolArgError')
    } catch (e) {
      assert.ok(e instanceof ToolArgError)
      assert.ok(e.issues.length >= 3, `kỳ vọng ≥3 issues, nhận: ${e.issues.join(' | ')}`)
    }
  })
})
