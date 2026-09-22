import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  runAgent,
  buildAgentSystemPrompt,
  GeminiBackend,
  type AgentMessage,
  type AssistantTurn,
  type ChatBackend,
} from './agent-loop'
import { ToolRegistry, type ToolDefinition } from './tool-registry'

const timeTool: ToolDefinition = {
  name: 'get_time',
  description: 'giờ hiện tại',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => '2026-09-22 08:00',
}

const searchTool: ToolDefinition = {
  name: 'search',
  description: 'tìm kiếm',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', minLength: 1 } },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (args) => `kết quả cho: ${args['query']}`,
}

/** Backend giả lập: trả về kịch bản turn dựng sẵn. */
function scriptedBackend(turns: AssistantTurn[]): ChatBackend & { calls: number } {
  let calls = 0
  const backend: ChatBackend & { calls: number } = {
    label: 'fake',
    calls: 0,
    send: async () => {
      const turn = turns[Math.min(calls, turns.length - 1)]
      calls++
      backend.calls = calls
      return { text: turn.text, toolCalls: turn.toolCalls.map((t) => ({ ...t })) }
    },
  }
  return backend
}

function registryWith(...tools: ToolDefinition[]): ToolRegistry {
  const r = new ToolRegistry()
  for (const t of tools) r.register(t)
  return r
}

describe('runAgent', () => {
  it('chạy 1 tool rồi trả lời (think → act → observe)', async () => {
    const backend = scriptedBackend([
      { text: '', toolCalls: [{ id: 'c1', name: 'get_time', args: {} }] },
      { text: 'Bây giờ là 08:00.', toolCalls: [] },
    ])
    const messages: AgentMessage[] = [{ role: 'user', content: 'Mấy giờ rồi?' }]
    const result = await runAgent({
      backend,
      tools: registryWith(timeTool).list(),
      messages,
      maxTurns: 6,
      workspaceId: 'ws1',
    })
    assert.equal(result.content, 'Bây giờ là 08:00.')
    assert.equal(result.turns, 2)
    assert.equal(result.stoppedReason, 'done')
    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].name, 'get_time')
    assert.equal(result.toolCalls[0].ok, true)
    assert.equal(backend.calls, 2)
  })

  it('tool không tồn tại → báo lỗi cho model, loop tiếp tục', async () => {
    const backend = scriptedBackend([
      { text: '', toolCalls: [{ id: 'c1', name: 'nope_tool', args: {} }] },
      { text: 'Xin lỗi, tôi không có tool đó.', toolCalls: [] },
    ])
    const result = await runAgent({
      backend,
      tools: registryWith(timeTool).list(),
      messages: [{ role: 'user', content: 'hi' }],
      workspaceId: 'ws1',
    })
    assert.equal(result.toolCalls[0].ok, false)
    assert.match(result.toolCalls[0].output, /không tồn tại/)
    assert.equal(result.content, 'Xin lỗi, tôi không có tool đó.')
  })

  it('args sai schema → tool không chạy, lỗi được đưa lại cho model', async () => {
    let executed = false
    const strict: ToolDefinition = {
      ...searchTool,
      execute: async () => {
        executed = true
        return 'x'
      },
    }
    const backend = scriptedBackend([
      { text: '', toolCalls: [{ id: 'c1', name: 'search', args: {} }] }, // thiếu query
      { text: 'done', toolCalls: [] },
    ])
    const result = await runAgent({
      backend,
      tools: registryWith(strict).list(),
      messages: [{ role: 'user', content: 'hi' }],
      workspaceId: 'ws1',
    })
    assert.equal(executed, false)
    assert.equal(result.toolCalls[0].ok, false)
    assert.match(result.toolCalls[0].output, /Args không hợp lệ/)
  })

  it('dừng ở maxTurns khi model cứ gọi tool mãi', async () => {
    const backend = scriptedBackend([
      { text: '', toolCalls: [{ id: 'c1', name: 'get_time', args: {} }] },
    ])
    const result = await runAgent({
      backend,
      tools: registryWith(timeTool).list(),
      messages: [{ role: 'user', content: 'hi' }],
      maxTurns: 3,
      workspaceId: 'ws1',
    })
    assert.equal(result.stoppedReason, 'max_turns')
    assert.equal(result.turns, 3)
    assert.equal(result.toolCalls.length, 3)
  })

  it('model trả lời thẳng → 1 turn, không gọi tool', async () => {
    const backend = scriptedBackend([{ text: 'Chào bạn!', toolCalls: [] }])
    const result = await runAgent({
      backend,
      tools: registryWith(timeTool).list(),
      messages: [{ role: 'user', content: 'chào' }],
      workspaceId: 'ws1',
    })
    assert.equal(result.turns, 1)
    assert.equal(result.toolCalls.length, 0)
    assert.equal(backend.calls, 1)
  })

  it('gọi nhiều tool trong một turn', async () => {
    const backend = scriptedBackend([
      {
        text: '',
        toolCalls: [
          { id: 'c1', name: 'get_time', args: {} },
          { id: 'c2', name: 'search', args: { query: 'giá vàng' } },
        ],
      },
      { text: 'Xong.', toolCalls: [] },
    ])
    const result = await runAgent({
      backend,
      tools: registryWith(timeTool, searchTool).list(),
      messages: [{ role: 'user', content: 'giờ và giá vàng' }],
      workspaceId: 'ws1',
    })
    assert.equal(result.toolCalls.length, 2)
    assert.ok(result.toolCalls.every((t) => t.ok))
    assert.match(result.toolCalls[1].output, /giá vàng/)
  })
})

describe('buildAgentSystemPrompt', () => {
  it('liệt kê tools và quy tắc tiếng Việt', () => {
    const p = buildAgentSystemPrompt(['web_search', 'get_current_time'])
    assert.match(p, /web_search/)
    assert.match(p, /tiếng Việt/)
  })
})

describe('GeminiBackend', () => {
  const nestedTool: ToolDefinition = {
    name: 'nested',
    description: 'tool có schema lồng nhau',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: { tag: { type: 'string' } },
          additionalProperties: false,
        },
      },
      required: ['filter'],
      additionalProperties: false,
    } as unknown as ToolDefinition['parameters'],
    execute: async () => 'ok',
  }

  function deepKeys(obj: unknown, acc: string[] = []): string[] {
    if (Array.isArray(obj)) obj.forEach((v) => deepKeys(v, acc))
    else if (obj !== null && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        acc.push(k)
        deepKeys(v, acc)
      }
    }
    return acc
  }

  it('loại bỏ additionalProperties khỏi function declarations (Gemini từ chối field này với 400)', async () => {
    let sentBody: any = null
    const origFetch = globalThis.fetch
    ;(globalThis as any).fetch = async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body)
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'xong' }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    try {
      const backend = new GeminiBackend('https://example.com', 'key', 'gemini-2.0-flash', 100)
      const turn = await backend.send([{ role: 'user', content: 'hi' }], [searchTool, nestedTool])
      assert.equal(turn.text, 'xong')
      const decls = sentBody.tools[0].functionDeclarations
      assert.equal(decls.length, 2)
      assert.ok(!deepKeys(decls).includes('additionalProperties'))
      // schema hợp lệ vẫn giữ nguyên
      assert.equal(decls[0].name, 'search')
      assert.deepEqual(decls[0].parameters.required, ['query'])
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
