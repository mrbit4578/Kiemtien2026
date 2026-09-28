import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

export interface AuditInput {
  workspaceId: string
  actorId: string
  action: string
  provider?: string
  entityType?: string
  targetId?: string
  result?: 'success' | 'failure'
  metadata?: Record<string, unknown>
  ip?: string
}

// Key nghi chứa secret → redact trước khi lưu metadata
const SENSITIVE_KEYS = ['token', 'secret', 'code', 'verifier', 'password', 'authorization']

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s)) ? '[redacted]' : sanitize(v)
    }
    return out
  }
  return value
}

/**
 * AuditLogService — ghi audit log immutable vào DB.
 * KHÔNG bao giờ throw: lỗi ghi audit không được làm gãy flow chính.
 * KHÔNG lưu secret/token/code vào metadata (sanitize + redact).
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          action: input.action,
          provider: input.provider,
          entityType: input.entityType,
          targetId: input.targetId,
          result: input.result ?? 'success',
          metadata: input.metadata ? JSON.stringify(sanitize(input.metadata)) : null,
          ipHash: input.ip ? createHash('sha256').update(input.ip).digest('hex') : null,
        },
      })
    } catch (err) {
      // Chỉ log message, KHÔNG log metadata (có thể chứa dữ liệu nhạy cảm)
      console.error(`[audit] write failed action=${input.action}:`, (err as Error).message)
    }
  }
}
