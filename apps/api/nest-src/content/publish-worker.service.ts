import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getConnector } from '../common/provider-registry'
import { encrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'
import type { Connection, Provider, PublishInput } from '@orh/shared'

/**
 * Publish worker — xử lý các Job publish content còn kẹt ở trạng thái 'pending'.
 *
 * Bối cảnh: POST /content/:id/publish chỉ tạo Job (status='pending') trong DB,
 * không publish trực tiếp. Trước đây worker chưa từng được implement nên job kẹt
 * vĩnh viễn: bấm lại thì dính idempotency (P2002), tab "Đã xuất bản" mãi trống.
 *
 * Thiết kế:
 * - Poll in-process (không cần Redis/BullMQ): đơn giản, đủ cho 1 instance Render.
 *   Khi cần scale nhiều instance hoặc throughput cao, thay bằng BullMQ mà không
 *   đổi contract (bảng jobs vẫn là source of truth).
 * - Claim nguyên tử: UPDATE ... WHERE status='pending' — instance nào update
 *   được (count=1) thì sở hữu job, tránh xử lý trùng khi scale.
 * - Crash recovery: khi khởi động, reset job 'running' về 'pending' (deploy mới
 *   trên Render SIGTERM instance cũ có thể bỏ lại job đang chạy dở).
 * - Retry với backoff mũ cho lỗi retryable (tối đa MAX_ATTEMPTS lần rồi vào
 *   dead_letter); lỗi vĩnh viễn (CONTENT_REJECTED, PERMISSION_DENIED, ...) →
 *   'failed' ngay.
 * - RATE_LIMITED được coi là retryable với backoff dài (1h) dù connector đánh
 *   dấu retryable=false — rate limit theo thời gian nên thử lại sau là hợp lý.
 */

const DEFAULT_POLL_MS = 15_000
const DEFAULT_BATCH_SIZE = 5
const MAX_ATTEMPTS = 5
/** Backoff cơ số: 30s * 2^(attempts-1), trần 30 phút */
const BASE_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 30 * 60_000
/** Backoff riêng cho rate limit: thử lại sau 1h */
const RATE_LIMIT_BACKOFF_MS = 60 * 60_000

export function computeBackoffMs(attempts: number, isRateLimited: boolean): number {
  if (isRateLimited) return RATE_LIMIT_BACKOFF_MS
  const exp = Math.min(attempts, 10)
  return Math.min(BASE_BACKOFF_MS * 2 ** (exp - 1), MAX_BACKOFF_MS)
}

export type RetryDecision =
  | { kind: 'retry'; delayMs: number }
  | { kind: 'terminal'; status: 'failed' | 'dead_letter' }

export function decideRetry(err: unknown, attempts: number): RetryDecision {
  const isRateLimited = err instanceof OrhError && err.code === 'RATE_LIMITED'
  const retryable = isRateLimited || (err instanceof OrhError && err.retryable)
  if (retryable && attempts < MAX_ATTEMPTS) {
    return { kind: 'retry', delayMs: computeBackoffMs(attempts, isRateLimited) }
  }
  if (err instanceof OrhError && err.code === 'RATE_LIMITED') {
    // Hết lượt retry vì rate limit kéo dài → dead_letter để admin xử lý thủ công
    return { kind: 'terminal', status: 'dead_letter' }
  }
  return { kind: 'terminal', status: attempts >= MAX_ATTEMPTS ? 'dead_letter' : 'failed' }
}

function workerEnabled(): boolean {
  return (process.env.PUBLISH_WORKER_ENABLED ?? 'true').toLowerCase() !== 'false'
}

function pollMs(): number {
  const v = Number(process.env.PUBLISH_POLL_MS)
  return Number.isFinite(v) && v >= 1000 ? v : DEFAULT_POLL_MS
}

function batchSize(): number {
  const v = Number(process.env.PUBLISH_BATCH_SIZE)
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : DEFAULT_BATCH_SIZE
}

@Injectable()
export class PublishWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishWorkerService.name)
  private timer: NodeJS.Timeout | null = null
  private ticking = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!workerEnabled()) {
      this.logger.log('Publish worker tắt (PUBLISH_WORKER_ENABLED=false).')
      return
    }
    // Crash recovery: job nào còn 'running' (instance cũ bị SIGTERM khi deploy)
    // thì trả về 'pending' để xử lý lại.
    try {
      const recovered = await this.prisma.job.updateMany({
        where: { status: 'running' },
        data: { status: 'pending', nextRunAt: null },
      })
      if (recovered.count > 0) {
        this.logger.log(`Khôi phục ${recovered.count} job publish còn dở dang về pending.`)
      }
    } catch (err) {
      this.logger.error(`Không khôi phục được job dở dang: ${(err as Error).message}`)
    }
    this.timer = setInterval(() => void this.tick(), pollMs())
    // Chạy ngay một vòng khi khởi động để job tồn đọng được xử lý sớm
    void this.tick()
    this.logger.log(`Publish worker started (poll ${pollMs()}ms, batch ${batchSize()}).`)
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Public để test/gọi thủ công — xử lý một vòng poll. */
  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      const now = new Date()
      const candidates = await this.prisma.job.findMany({
        where: {
          status: 'pending',
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
        },
        orderBy: { nextRunAt: 'asc' },
        take: batchSize(),
        select: { id: true },
      })
      for (const { id } of candidates) {
        // Claim nguyên tử: chỉ instance nào đổi được status mới sở hữu job
        const claimed = await this.prisma.job.updateMany({
          where: { id, status: 'pending' },
          data: { status: 'running', attempts: { increment: 1 }, lastError: null },
        })
        if (claimed.count === 1) {
          await this.processJob(id).catch((err: unknown) => {
            this.logger.error(`Lỗi không mong đợi khi xử lý job ${id}: ${(err as Error).message}`)
          })
        }
      }
    } catch (err) {
      this.logger.error(`Publish worker tick thất bại: ${(err as Error).message}`)
    } finally {
      this.ticking = false
    }
  }

  private async processJob(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { connection: true, contentItem: true },
    })
    if (!job) {
      this.logger.warn(`Job ${jobId} không còn tồn tại, bỏ qua.`)
      return
    }

    try {
      const result = await this.publishOnce(job)
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'done', lastError: null },
      })
      if (job.contentItemId) {
        await this.prisma.contentItem.update({
          where: { id: job.contentItemId },
          data: { status: 'published' },
        })
      }
      await this.audit.log({
        workspaceId: job.workspaceId,
        actorId: job.workspaceId,
        action: 'content_publish_succeeded',
        provider: job.connection.provider,
        entityType: 'job',
        targetId: job.id,
        result: 'success',
        metadata: {
          contentId: job.contentItemId,
          platformPostId: result.platformPostId,
          url: result.url,
        },
      })
      this.logger.log(`Publish job ${job.id} thành công (${result.platformPostId}).`)
    } catch (err) {
      const attempts = job.attempts // đã increment lúc claim
      const decision = decideRetry(err, attempts)
      const message = err instanceof Error ? err.message : String(err)
      if (decision.kind === 'retry') {
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'pending',
            nextRunAt: new Date(Date.now() + decision.delayMs),
            lastError: message.slice(0, 500),
          },
        })
        this.logger.warn(
          `Publish job ${job.id} thất bại (lần ${attempts}), thử lại sau ${Math.round(decision.delayMs / 1000)}s: ${message}`,
        )
      } else {
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: decision.status, lastError: message.slice(0, 500) },
        })
        if (job.contentItemId) {
          await this.prisma.contentItem.update({
            where: { id: job.contentItemId },
            data: { status: 'failed' },
          })
        }
        await this.audit.log({
          workspaceId: job.workspaceId,
          actorId: job.workspaceId,
          action: 'content_publish_failed',
          provider: job.connection.provider,
          entityType: 'job',
          targetId: job.id,
          result: 'failure',
          metadata: { contentId: job.contentItemId, error: message.slice(0, 500) },
        })
        this.logger.error(`Publish job ${job.id} ${decision.status}: ${message}`)
      }
    }
  }

  private async publishOnce(job: {
    connection: {
      id: string
      workspaceId: string
      provider: string
      providerUserId: string
      encryptedAccessToken: string
      encryptedRefreshToken: string | null
      expiresAt: Date
      scopesJson: string[]
      status: string
    }
    contentItem: {
      id: string
      caption: string
      assetUrl: string | null
      approvalStatus: string
    } | null
  }): Promise<{ platformPostId: string; url?: string }> {
    const { connection } = job
    const item = job.contentItem
    if (!item) throw new OrhError('INVALID_STATE', 'Job không gắn với content item.', false)
    if (item.approvalStatus !== 'approved') {
      throw new OrhError('INVALID_STATE', 'Content chưa được approve.', false)
    }
    if (connection.status !== 'active') {
      throw new OrhError(
        'CONNECTION_NOT_FOUND',
        `Connection đang ở trạng thái ${connection.status}, cần kết nối lại.`,
        false,
        connection.provider,
      )
    }

    const connector = getConnector(connection.provider)
    const sharedConnection: Connection = {
      id: connection.id,
      workspaceId: connection.workspaceId,
      provider: connection.provider as Provider,
      providerUserId: connection.providerUserId,
      encryptedAccessToken: connection.encryptedAccessToken,
      encryptedRefreshToken: connection.encryptedRefreshToken ?? undefined,
      expiresAt: connection.expiresAt,
      scopesJson: connection.scopesJson,
      status: connection.status as Connection['status'],
      createdAt: new Date(),
    }

    // Token hết hạn → thử refresh một lần trước khi publish
    if (sharedConnection.expiresAt.getTime() < Date.now()) {
      try {
        const refreshed = await connector.refresh(sharedConnection)
        const encrypted = encrypt(refreshed.accessToken)
        await this.prisma.connection.update({
          where: { id: connection.id },
          data: { encryptedAccessToken: encrypted, expiresAt: refreshed.expiresAt },
        })
        sharedConnection.encryptedAccessToken = encrypted
        sharedConnection.expiresAt = refreshed.expiresAt
        this.logger.log(`Đã refresh token cho connection ${connection.id} (${connection.provider}).`)
      } catch {
        await this.prisma.connection.update({
          where: { id: connection.id },
          data: { status: 'reauth_required', lastError: 'Token hết hạn, refresh thất bại.' },
        })
        throw new OrhError(
          'PROVIDER_REAUTH_REQUIRED',
          'Token hết hạn và refresh thất bại. Hãy kết nối lại tài khoản.',
          false,
          connection.provider,
        )
      }
    }

    // assetUrl có thể chứa nhiều URL (mỗi dòng một link, cách nhau bởi xuống dòng
    // hoặc dấu phẩy) — nhiều ảnh → connector Instagram đăng dạng carousel.
    const mediaUrls = item.assetUrl
      ? item.assetUrl
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    if (connection.provider === 'instagram' && mediaUrls.length === 0) {
      throw new OrhError(
        'CONTENT_REJECTED',
        'Instagram yêu cầu ảnh/video (assetUrl) để đăng bài.',
        false,
        'instagram',
      )
    }

    const input: PublishInput = {
      connection: sharedConnection,
      caption: item.caption,
      mediaUrls,
    }
    return connector.publish(input)
  }
}
