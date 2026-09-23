/**
 * JSON-RPC line protocol của `concat-cli serve` (Concat API 0.2).
 *
 * - Mỗi kết nối TCP/Unix socket gửi DÒNG ĐẦU TIÊN là lời gọi `auth`:
 *   {"jsonrpc":"2.0","id":0,"method":"auth","params":{"token":"..."}}
 *   Sai token → server trả lỗi, không cho gọi tiếp.
 * - Sau đó mỗi request một dòng: {"jsonrpc":"2.0","id":N,"method":"...","params":{...}}
 * - Response: {"jsonrpc":"2.0","id":N,"result":...} hoặc
 *   {"jsonrpc":"2.0","id":N,"error":{"code":...,"message":"..."}}
 * - Event (không có id): {"jsonrpc":"2.0","method":"export.done","params":{...}}
 *
 * File này PURE — không chạm network, test được độc lập không cần binary Concat.
 */

export interface RpcErrorShape {
  code: unknown
  message: string
}

export type ParsedLine =
  | { kind: 'response'; id: number; result?: unknown; error?: RpcErrorShape }
  | { kind: 'event'; method: string; params: Record<string, unknown> }

/** Lỗi protocol (dòng không parse được, handshake sai) — lỗi phía mình. */
export class ConcatProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConcatProtocolError'
  }
}

/** Lỗi do Concat server trả về — lỗi phía engine, có code để rẽ nhánh. */
export class ConcatApiError extends Error {
  readonly code: unknown
  constructor(code: unknown, message: string) {
    super(message)
    this.name = 'ConcatApiError'
    this.code = code
  }
}

/** Dòng auth — LUÔN là dòng đầu tiên trên mỗi kết nối mới. */
export function authLine(id: number, token: string): string {
  return (
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'auth',
      params: { token },
    }) + '\n'
  )
}

/** Một request JSON-RPC trên một dòng. */
export function requestLine(id: number, method: string, params?: unknown): string {
  const envelope: Record<string, unknown> = { jsonrpc: '2.0', id, method }
  if (params !== undefined) envelope['params'] = params
  return JSON.stringify(envelope) + '\n'
}

/** Parse một dòng server trả về → response (theo id) hoặc event (theo method). */
export function parseLine(line: string): ParsedLine {
  let obj: unknown
  try {
    obj = JSON.parse(line)
  } catch {
    throw new ConcatProtocolError(`Dòng không phải JSON hợp lệ: ${line.slice(0, 120)}`)
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new ConcatProtocolError('Dòng JSON phải là object.')
  }
  const o = obj as Record<string, unknown>

  // Event: có method, KHÔNG có id.
  if (typeof o['method'] === 'string' && o['id'] === undefined) {
    const params = o['params']
    return {
      kind: 'event',
      method: o['method'] as string,
      params:
        typeof params === 'object' && params !== null
          ? (params as Record<string, unknown>)
          : {},
    }
  }

  // Response: có id số + result hoặc error.
  if (typeof o['id'] === 'number' && ('result' in o || 'error' in o)) {
    if ('error' in o) {
      const e = o['error'] as Record<string, unknown>
      return {
        kind: 'response',
        id: o['id'] as number,
        error: {
          code: e?.['code'],
          message: typeof e?.['message'] === 'string' ? (e['message'] as string) : 'Lỗi không rõ từ Concat.',
        },
      }
    }
    return { kind: 'response', id: o['id'] as number, result: o['result'] }
  }

  throw new ConcatProtocolError(
    `Dòng không phải response (id+result/error) cũng không phải event (method): ${line.slice(0, 120)}`,
  )
}

/** Tách các dòng hoàn chỉnh khỏi buffer TCP (giữ phần dở lại). */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const lines: string[] = []
  let start = 0
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === '\n') {
      const line = buffer.slice(start, i).replace(/\r$/, '')
      if (line.length > 0) lines.push(line)
      start = i + 1
    }
  }
  return { lines, rest: buffer.slice(start) }
}
