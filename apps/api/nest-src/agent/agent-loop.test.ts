import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  runAgent,
  buildAgentSystemPrompt,
  GeminiBackend,
  OpenAiCompatibleBackend,
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

  it('gọi trùng tool+args trong cùng turn → chỉ chạy 1 lần, tái dùng kết quả', async () => {
    let executions = 0
    const counting: ToolDefinition = {
      ...timeTool,
      execute: async () => {
        executions++
        return `lần ${executions}`
      },
    }
    const backend = scriptedBackend([
      {
        text: '',
        toolCalls: [
          { id: 'c1', name: 'get_time', args: {} },
          { id: 'c2', name: 'get_time', args: {} },
        ],
      },
      { text: 'Xong.', toolCalls: [] },
    ])
    const result = await runAgent({
      backend,
      tools: registryWith(counting).list(),
      messages: [{ role: 'user', content: 'hi' }],
      workspaceId: 'ws1',
    })
    assert.equal(executions, 1)
    assert.equal(result.toolCalls.length, 2)
    assert.equal(result.toolCalls[0].output, result.toolCalls[1].output)
    assert.ok(result.toolCalls.every((t) => t.ok))
  })

  it('turn cuối chèn nudge yêu cầu tổng hợp, không gọi thêm tool', async () => {
    const seen: AgentMessage[][] = []
    let calls = 0
    const backend: ChatBackend = {
      label: 'fake',
      send: async (messages) => {
        seen.push(messages)
        calls++
        if (calls < 3) {
          return { text: '', toolCalls: [{ id: `c${calls}`, name: 'get_time', args: {} }] }
        }
        return { text: 'Tổng hợp xong.', toolCalls: [] }
      },
    }
    const result = await runAgent({
      backend,
      tools: registryWith(timeTool).list(),
      messages: [{ role: 'user', content: 'hi' }],
      maxTurns: 3,
      workspaceId: 'ws1',
    })
    assert.equal(result.stoppedReason, 'done')
    assert.equal(result.content, 'Tổng hợp xong.')
    const lastMsgs = seen[seen.length - 1]
    const nudge = lastMsgs[lastMsgs.length - 1]
    assert.equal(nudge.role, 'user')
    assert.match(nudge.content, /lượt cuối cùng/)
  })
})

describe('buildAgentSystemPrompt', () => {
  it('liệt kê tools và quy tắc tiếng Việt', () => {
    const p = buildAgentSystemPrompt(['web_search', 'get_current_time'])
    assert.match(p, /web_search/)
    assert.match(p, /tiếng Việt/)
  })

  it('mang sứ mệnh viral → tương tác → thu nhập thụ động của Kiemtien2026', () => {
    const p = buildAgentSystemPrompt(['web_search'])
    assert.match(p, /Kiemtien2026/)
    assert.match(p, /VIRAL/)
    assert.match(p, /THU NHẬP THỤ ĐỘNG/)
    assert.match(p, /HOOK/)
    assert.match(p, /KHÔNG hứa hẹn thu nhập chắc chắn/)
  })

  it('bắt buộc final answer tách 3 khối: KỊCH BẢN QUAY + CAPTION ĐĂNG BÀI + LƯU Ý ĐĂNG BÀI', () => {
    const p = buildAgentSystemPrompt(['web_search'])
    assert.match(p, /KỊCH BẢN QUAY/)
    assert.match(p, /CAPTION ĐĂNG BÀI/)
    assert.match(p, /LƯU Ý ĐĂNG BÀI/)
    // Caption đăng bài cấm dấu vết kịch bản thô
    assert.match(p, /TUYỆT ĐỐI KHÔNG dùng \*\*/)
  })

  it('chế độ json: bỏ hoàn toàn section 3 khối, thay bằng yêu cầu JSON nghiêm ngặt', () => {
    const p = buildAgentSystemPrompt(['web_search'], { outputMode: 'json' })
    assert.match(p, /DỮ LIỆU CÓ CẤU TRÚC/)
    // Không còn các tiêu đề khối (section JSON chỉ nhắc tên để cấm, không phải để dùng)
    assert.doesNotMatch(p, /^## KỊCH BẢN QUAY$/m)
    assert.doesNotMatch(p, /^## CAPTION ĐĂNG BÀI$/m)
    assert.doesNotMatch(p, /^## LƯU Ý ĐĂNG BÀI$/m)
    // Vẫn giữ guardrails an toàn
    assert.match(p, /KHÔNG hứa hẹn thu nhập chắc chắn/)
  })

  it('có doctrine video faceless: original-first, evidence-first, permission-first', () => {
    const p = buildAgentSystemPrompt(['web_search'])
    assert.match(p, /Original-first/)
    assert.match(p, /Evidence-first/)
    assert.match(p, /Permission-first/)
    assert.match(p, /video_brief/)
    assert.match(p, /video_risk_score/)
  })

  it('có kỷ luật vòng lặp ReAct: thought ngắn, trả lời thẳng khi đủ info, gọi song song, retry có trần', () => {
    const p = buildAgentSystemPrompt(['web_search'])
    assert.match(p, /Kỷ luật vòng lặp ReAct/)
    assert.match(p, /TRẢ LỜI THẲNG/)
    assert.match(p, /SONG SONG/)
    assert.match(p, /tối đa 2 lần/)
    assert.match(p, /KHÔNG đoán URL/)
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
      const backend = new GeminiBackend('https://example.com', 'key', 'gemini-3.6-flash', 100)
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

  it('giữ thoughtSignature qua 2 turn (thiếu là Gemini 400 missing thought_signature)', async () => {
    const bodies: any[] = []
    const origFetch = globalThis.fetch
    let call = 0
    ;(globalThis as any).fetch = async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body))
      call++
      if (call === 1) {
        // Turn 1: model trả functionCall kèm thoughtSignature ở part level
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: { name: 'get_current_time', args: {} },
                      thoughtSignature: 'sig-abc-123',
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      // Turn 2: model trả lời sau khi có kết quả tool
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'đã xong' }] } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    try {
      const backend = new GeminiBackend('https://example.com', 'key', 'gemini-3.6-flash', 100)
      // Turn 1 — parse: signature phải được giữ lại trong toolCall
      const t1 = await backend.send([{ role: 'user', content: 'mấy giờ rồi?' }], [timeTool])
      assert.equal(t1.toolCalls.length, 1)
      assert.equal(t1.toolCalls[0].thoughtSignature, 'sig-abc-123')
      // Turn 2 — serialize: signature phải echo lại ngang hàng functionCall
      const history = [
        { role: 'user', content: 'mấy giờ rồi?' },
        { role: 'assistant', content: '', toolCalls: t1.toolCalls },
        { role: 'tool', toolName: 'get_current_time', content: '21:00' },
      ] as any
      await backend.send(history, [timeTool])
      const modelContent = bodies[1].contents.find((c: any) => c.role === 'model')
      const fcPart = modelContent.parts.find((p: any) => p.functionCall)
      assert.ok(fcPart, 'có part functionCall trong history gửi đi')
      assert.equal(fcPart.thoughtSignature, 'sig-abc-123')
      assert.equal(fcPart.functionCall.name, 'get_current_time')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('model không trả thoughtSignature (VD: gemini-2.5) → không gửi field thừa', async () => {
    let sentBody: any = null
    const origFetch = globalThis.fetch
    ;(globalThis as any).fetch = async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body)
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ functionCall: { name: 'get_time', args: {} } }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    try {
      const backend = new GeminiBackend('https://example.com', 'key', 'gemini-2.5-flash', 100)
      const t1 = await backend.send([{ role: 'user', content: 'hi' }], [timeTool])
      assert.equal(t1.toolCalls[0].thoughtSignature, undefined)
      const history = [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', toolCalls: t1.toolCalls },
        { role: 'tool', toolName: 'get_time', content: 'ok' },
      ] as any
      await backend.send(history, [timeTool])
      const modelContent = sentBody.contents.find((c: any) => c.role === 'model')
      const fcPart = modelContent.parts.find((p: any) => p.functionCall)
      assert.ok(!('thoughtSignature' in fcPart), 'không gửi thoughtSignature khi model không trả')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

describe('OpenAiCompatibleBackend — retry 400 tool_use_failed', () => {
  const TOOL_FAIL_BODY = JSON.stringify({
    error: {
      message: 'Failed to parse tool call arguments as JSON',
      type: 'invalid_request_error',
      code: 'tool_use_failed',
    },
  })
  const okBody = (text: string) =>
    JSON.stringify({ choices: [{ message: { content: text, tool_calls: [] } }] })

  function mockFetchOnce(responses: Array<{ status: number; body: string; headers?: Record<string, string> }>) {
    const origFetch = globalThis.fetch
    let calls = 0
    ;(globalThis as any).fetch = async () => {
      const r = responses[Math.min(calls, responses.length - 1)]
      calls++
      return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) } })
    }
    return {
      calls: () => calls,
      restore: () => {
        globalThis.fetch = origFetch
      },
    }
  }

  it('thử lại khi Groq trả 400 tool_use_failed rồi thành công', async () => {
    const mock = mockFetchOnce([
      { status: 400, body: TOOL_FAIL_BODY },
      { status: 200, body: okBody('xong') },
    ])
    try {
      const backend = new OpenAiCompatibleBackend('https://api.groq.com/openai/v1', 'key', 'openai/gpt-oss-120b', 100)
      const turn = await backend.send([{ role: 'user', content: 'hi' }], [timeTool])
      assert.equal(turn.text, 'xong')
      assert.equal(mock.calls(), 2)
    } finally {
      mock.restore()
    }
  })

  it('báo ngay với 400 khác (không phải tool_use_failed)', async () => {
    const mock = mockFetchOnce([
      { status: 400, body: JSON.stringify({ error: { message: 'model_not_found', code: 'invalid_model' } }) },
    ])
    try {
      const backend = new OpenAiCompatibleBackend('https://api.groq.com/openai/v1', 'key', 'openai/gpt-oss-120b', 100)
      await assert.rejects(
        backend.send([{ role: 'user', content: 'hi' }], [timeTool]),
        /Provider trả lỗi 400/,
      )
      assert.equal(mock.calls(), 1)
    } finally {
      mock.restore()
    }
  })

  it('dừng sau 4 lần thử khi tool_use_failed liên tục', async () => {
    const mock = mockFetchOnce([{ status: 400, body: TOOL_FAIL_BODY }])
    try {
      const backend = new OpenAiCompatibleBackend('https://api.groq.com/openai/v1', 'key', 'openai/gpt-oss-120b', 100)
      await assert.rejects(
        backend.send([{ role: 'user', content: 'hi' }], [timeTool]),
        /tool_use_failed/,
      )
      assert.equal(mock.calls(), 4)
    } finally {
      mock.restore()
    }
  })

  it('429: chờ theo gợi ý "try again in Xs" rồi thử lại thành công', async () => {
    const mock = mockFetchOnce([
      { status: 429, body: JSON.stringify({ error: { message: 'Rate limit reached. Please try again in 0.01s.' } }) },
      { status: 200, body: okBody('xong sau 429') },
    ])
    try {
      const backend = new OpenAiCompatibleBackend('https://api.groq.com/openai/v1', 'key', 'openai/gpt-oss-120b', 100)
      const t0 = Date.now()
      const turn = await backend.send([{ role: 'user', content: 'hi' }], [timeTool])
      assert.equal(turn.text, 'xong sau 429')
      assert.equal(mock.calls(), 2)
      assert.ok(Date.now() - t0 < 5000, 'không chờ quá lâu trong test')
    } finally {
      mock.restore()
    }
  })

  it('429: ưu tiên header retry-after', async () => {
    const mock = mockFetchOnce([
      { status: 429, body: 'slow down', headers: { 'retry-after': '0.01' } },
      { status: 200, body: okBody('xong') },
    ])
    try {
      const backend = new OpenAiCompatibleBackend('https://api.groq.com/openai/v1', 'key', 'openai/gpt-oss-120b', 100)
      const turn = await backend.send([{ role: 'user', content: 'hi' }], [timeTool])
      assert.equal(turn.text, 'xong')
      assert.equal(mock.calls(), 2)
    } finally {
      mock.restore()
    }
  })

  it('429 liên tục: dừng sau 4 lần thử', async () => {
    const mock = mockFetchOnce([
      { status: 429, body: JSON.stringify({ error: { message: 'Rate limit. try again in 0.01s' } }) },
    ])
    try {
      const backend = new OpenAiCompatibleBackend('https://api.groq.com/openai/v1', 'key', 'openai/gpt-oss-120b', 100)
      await assert.rejects(
        backend.send([{ role: 'user', content: 'hi' }], [timeTool]),
        /Provider trả lỗi 429/,
      )
      assert.equal(mock.calls(), 4)
    } finally {
      mock.restore()
    }
  })
})
