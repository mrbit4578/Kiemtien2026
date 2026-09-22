/**
 * Tool registry cho AI agent — port kiến trúc tool system của Strix sang NestJS.
 *
 * Nguyên tắc (giữ từ Strix, điều chỉnh cho môi trường Render không có Docker sandbox):
 * - Chỉ tool đã đăng ký (allowlist) mới được gọi — KHÔNG có shell tùy ý.
 * - Mọi args đều validate bằng JSON Schema trước khi execute.
 * - Tool chạy trong process API với timeout riêng; lỗi tool không sập cả vòng lặp.
 */

/** JSON Schema (subset) mô tả args của tool. */
export interface JsonSchema {
  type: 'object'
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: Array<string | number | boolean>
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  items?: JsonSchemaProperty
}

/** Context truyền vào mỗi tool khi chạy. */
export interface ToolContext {
  workspaceId: string
  signal?: AbortSignal
}

export interface ToolDefinition {
  /** Tên duy nhất, snake_case. */
  name: string
  /** Mô tả cho model đọc — quyết định model có gọi đúng tool hay không. */
  description: string
  parameters: JsonSchema
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
}

export class ToolArgError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly issues: string[],
  ) {
    super(`Args không hợp lệ cho tool "${toolName}": ${issues.join('; ')}`)
    this.name = 'ToolArgError'
  }
}

function checkType(value: unknown, type: JsonSchemaProperty['type']): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}

/**
 * Validate args theo JSON Schema (subset). Trả về args đã chuẩn hóa
 * (giữ nguyên object) hoặc ném ToolArgError liệt kê mọi lỗi.
 */
export function validateToolArgs(
  toolName: string,
  schema: JsonSchema,
  args: unknown,
): Record<string, unknown> {
  const issues: string[] = []
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new ToolArgError(toolName, ['args phải là một object'])
  }
  const obj = args as Record<string, unknown>
  const props = schema.properties ?? {}

  for (const key of schema.required ?? []) {
    if (!(key in obj) || obj[key] === undefined) {
      issues.push(`thiếu trường bắt buộc "${key}"`)
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(obj)) {
      if (!(key in props)) issues.push(`trường không được phép "${key}"`)
    }
  }

  for (const [key, prop] of Object.entries(props)) {
    const value = obj[key]
    if (value === undefined) continue
    if (!checkType(value, prop.type)) {
      issues.push(`"${key}" phải là ${prop.type}`)
      continue
    }
    if (prop.enum && !prop.enum.includes(value as string | number | boolean)) {
      issues.push(`"${key}" phải là một trong: ${prop.enum.join(', ')}`)
    }
    if (typeof value === 'string') {
      if (prop.minLength !== undefined && value.length < prop.minLength) {
        issues.push(`"${key}" quá ngắn (tối thiểu ${prop.minLength} ký tự)`)
      }
      if (prop.maxLength !== undefined && value.length > prop.maxLength) {
        issues.push(`"${key}" quá dài (tối đa ${prop.maxLength} ký tự)`)
      }
    }
    if (typeof value === 'number') {
      if (prop.minimum !== undefined && value < prop.minimum) {
        issues.push(`"${key}" phải >= ${prop.minimum}`)
      }
      if (prop.maximum !== undefined && value > prop.maximum) {
        issues.push(`"${key}" phải <= ${prop.maximum}`)
      }
    }
    if (prop.type === 'array' && prop.items && Array.isArray(value)) {
      const bad = value.findIndex((v) => !checkType(v, prop.items!.type))
      if (bad !== -1) issues.push(`"${key}[${bad}]" phải là ${prop.items.type}`)
    }
  }

  if (issues.length > 0) throw new ToolArgError(toolName, issues)
  return obj
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
      throw new Error(`Tên tool không hợp lệ: "${tool.name}" (phải là snake_case)`)
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" đã được đăng ký`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** Danh sách tool (metadata) — dùng để build prompt/dialect cho model. */
  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  listNames(): string[] {
    return [...this.tools.keys()]
  }
}
