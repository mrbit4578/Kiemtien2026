import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { PublishWebhookService } from './publish-webhook.service'
import { getConnector } from '../common/provider-registry'
import { assertSafeUrl, fetchTimeout, SsrfBlockedError } from '../common/safe-fetch'
import { encrypt, TokenDecryptError } from '@orh/crypto'
import { OrhError, detectMediaKind } from '@orh/shared'
import type { Connection, Provider, PublishInput, MediaKind } from '@orh/shared'

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
 * - Crash recovery: khi khởi động, reset job 'running'/'publishing' về
 *   'pending' (deploy mới trên Render SIGTERM instance cũ có thể bỏ lại job
 *   đang chạy dở; 'publishing' giữ hành vi cũ vì cửa sổ mơ hồ hẹp — còn DB
 *   hiccup SAU publish thành công đã có 'publish_confirm_pending' riêng).
 * - CHỐNG ĐĂNG TRÙNG (P0): job được đánh dấu 'publishing' TRƯỚC KHI gọi
 *   connector.publish(). Nếu DB lỗi ngay sau khi provider đã nhận bài, job
 *   sang 'publish_confirm_pending' — tick sau chỉ verify (nếu connector hỗ
 *   trợ) rồi đánh dấu done, TUYỆT ĐỐI KHÔNG publish lại.
 * - SSRF (P1): probeMediaUrl validate mọi URL media qua assertSafeUrl (chặn
 *   IP nội bộ/metadata cloud, resolve tất cả IP chống DNS rebinding, mỗi hop
 *   redirect validate lại từ đầu).
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

/**
 * Trạng thái của Job publish (cột `jobs.status` là String — thêm giá trị mới
 * không cần migration, chỉ cần worker/controller hiểu cùng một tập giá trị).
 *
 * - pending: chờ tới lượt (worker poll).
 * - running: worker đã claim, đang chuẩn bị (validate, refresh token, probe...).
 * - publishing: đã gọi connector.publish() — provider CÓ THỂ đã nhận bài.
 * - publish_confirm_pending: provider đã nhận bài nhưng DB lỗi khi ghi 'done'
 *   → tick sau chỉ xác minh (verify nếu connector hỗ trợ) rồi đánh dấu done,
 *   TUYỆT ĐỐI KHÔNG publish lại (chống đăng trùng P0).
 * - done / failed / dead_letter: trạng thái cuối.
 */
export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PUBLISHING: 'publishing',
  PUBLISH_CONFIRM_PENDING: 'publish_confirm_pending',
  DONE: 'done',
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
} as const
export type JobStatusValue = (typeof JOB_STATUS)[keyof typeof JOB_STATUS]

export function decideRetry(err: unknown, attempts: number): RetryDecision {
  const isRateLimited = err instanceof OrhError && err.code === 'RATE_LIMITED'
  // TokenDecryptError: TOKEN_ENCRYPTION_KEY không khớp key lúc mã hóa token —
  // retry không bao giờ thành công (key không tự đúng lại). Fail ngay để user
  // thấy hướng dẫn "ngắt kết nối → kết nối lại" thay vì chờ hết backoff rồi
  // mới dead-letter với message crypto khó hiểu.
  if (err instanceof TokenDecryptError) {
    return { kind: 'terminal', status: 'failed' }
  }
  // Lỗi lạ không phải OrhError (ví dụ TypeError do fetch rớt mạng, DNS fail)
  // không chứng minh được là vĩnh viễn → coi như transient, retry với backoff.
  // Chỉ OrhError có retryable=false mới là lỗi vĩnh viễn (fail ngay).
  const retryable = isRateLimited || !(err instanceof OrhError) || err.retryable
  if (retryable && attempts < MAX_ATTEMPTS) {
    return { kind: 'retry', delayMs: computeBackoffMs(attempts, isRateLimited) }
  }
  if (err instanceof OrhError && err.code === 'RATE_LIMITED') {
    // Hết lượt retry vì rate limit kéo dài → dead_letter để admin xử lý thủ công
    return { kind: 'terminal', status: 'dead_letter' }
  }
  return { kind: 'terminal', status: attempts >= MAX_ATTEMPTS ? 'dead_letter' : 'failed' }
}

/** Giới hạn caption của Instagram (giới hạn của nền tảng). */
export const INSTAGRAM_CAPTION_LIMIT = 2200

/**
 * Rút gọn caption cho vừa giới hạn của nền tảng (nếu cần) — thay vì fail job.
 * - Chỉ áp dụng cho Instagram (TikTok/Facebook cho phép caption dài hơn).
 * - Cắt ở ranh giới câu/đoạn gần nhất để không cắt dở câu.
 * - Ưu tiên giữ lại cụm hashtag ở cuối caption (quan trọng cho reach).
 * - Draft gốc trong Content Studio được giữ nguyên, chỉ bản đăng đi bị rút gọn.
 */
export function fitCaptionToPlatformLimit(provider: string, caption: string): string {
  if (provider !== 'instagram' || caption.length <= INSTAGRAM_CAPTION_LIMIT) return caption

  // Tách cụm hashtag ở cuối để ưu tiên giữ lại
  const tagMatch = caption.match(/((?:#[^\s#]+\s*)+)\s*$/)
  const tags = tagMatch ? tagMatch[1].trim() : ''
  const body = tagMatch ? caption.slice(0, tagMatch.index).trimEnd() : caption
  const budget = INSTAGRAM_CAPTION_LIMIT - (tags ? tags.length + 1 : 0) // +1 cho dấu xuống dòng

  const cut = body.slice(0, Math.max(budget, 0))
  // Tìm ranh giới câu/đoạn gần nhất: ưu tiên hết đoạn, rồi hết dòng, rồi hết câu
  const lineBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n'))
  const sentenceEnd = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  )
  let trimmed: string
  if (lineBreak > budget * 0.5 && lineBreak >= sentenceEnd) {
    // Cắt ở hết đoạn/dòng → gọn, không cần dấu "…"
    trimmed = cut.slice(0, lineBreak).trimEnd()
  } else if (sentenceEnd > budget * 0.5) {
    // Cắt ở hết câu (giữ lại dấu câu) → không cần dấu "…"
    trimmed = cut.slice(0, sentenceEnd + 1).trimEnd()
  } else {
    // Không tìm được ranh giới đẹp → cắt cứng và đánh dấu "…" nếu thật sự bị cắt
    trimmed = cut.trimEnd()
    if (trimmed.length < body.length) trimmed += '…'
  }
  const result = tags ? `${trimmed}\n${tags}` : trimmed
  // Phòng hờ: nếu vẫn vượt (cụm hashtag quá dài), cắt cứng ở giới hạn
  return result.length > INSTAGRAM_CAPTION_LIMIT
    ? `${result.slice(0, INSTAGRAM_CAPTION_LIMIT - 1).trimEnd()}…`
    : result
}

/** Timeout cho mỗi lần probe URL media — fail nhanh để không kẹt worker. */
const MEDIA_PROBE_TIMEOUT_MS = 15_000
/** Số hop redirect tối đa khi probe (mỗi hop đều validate SSRF lại từ đầu). */
const MAX_PROBE_REDIRECTS = 3
/**
 * Cho phép probe URL nội bộ (127.0.0.1...) — CHỈ dùng cho test/dev local.
 * Production BẮT BUỘC để trống/false: URL media do user nhập phải đi qua
 * assertSafeUrl (chặn IP nội bộ, DNS rebinding, redirect-chain SSRF).
 */
function allowPrivateMediaUrls(): boolean {
  return (process.env.ALLOW_PRIVATE_MEDIA_URLS ?? '').toLowerCase() === 'true'
}

/**
 * Kiểm tra URL media có thật sự trỏ tới ảnh/video TRƯỚC KHI gọi API Instagram.
 * Fail-fast với message tiếng Việt rõ ràng thay vì để Instagram trả lỗi khó
 * hiểu ("Only photo or video can be accepted as media type") sau nhiều retry.
 *
 * Bảo mật (vá SSRF P1): mọi URL đều qua assertSafeUrl() — chặn IP nội bộ /
 * metadata cloud (169.254.169.254), resolve TẤT CẢ IP chống DNS rebinding,
 * và mỗi hop redirect đều validate lại từ đầu (chống redirect-chain SSRF).
 *
 * - Lỗi mạng/timeout khi probe → OrhError TRANSIENT_NETWORK_ERROR (retryable=true):
 *   link có thể vẫn tốt, chỉ là mạng lúc probe gặp sự cố.
 * - URL trỏ vào IP nội bộ/bị cấm → CONTENT_REJECTED (vĩnh viễn): link này
 *   không bao giờ hợp lệ, retry cũng vô ích.
 * - HTTP >= 400 → CONTENT_REJECTED (vĩnh viễn): link hỏng/hết hạn.
 * - content-type không phải image/* hay video/* → CONTENT_REJECTED (vĩnh viễn):
 *   thường do dán nhầm link trang web (ví dụ trang xem ảnh ibb.co) thay vì
 *   link ảnh trực tiếp, hoặc export Canva đã hết hạn trả về trang HTML.
 */
export async function probeMediaUrl(url: string): Promise<MediaKind> {
  const resolveTarget = async (target: string): Promise<URL> => {
    if (allowPrivateMediaUrls()) return new URL(target) // test/dev local only
    return assertSafeUrl(target)
  }

  let current = url
  let res: Response | undefined
  try {
    for (let hop = 0; hop <= MAX_PROBE_REDIRECTS; hop++) {
      let safe: URL
      try {
        safe = await resolveTarget(current)
      } catch (ssrfErr) {
        if (ssrfErr instanceof SsrfBlockedError) {
          throw new OrhError(
            'CONTENT_REJECTED',
            `Link media không an toàn (${ssrfErr.message}). Chỉ dùng link ảnh/video công khai, không dùng link nội bộ.`,
            false,
          )
        }
        throw ssrfErr
      }
      res = await fetchTimeout(safe.toString(), { method: 'HEAD', redirect: 'manual' }, MEDIA_PROBE_TIMEOUT_MS)
      if (res.status === 405 || res.status === 501) {
        // Host không hỗ trợ HEAD → GET 1 byte đầu chỉ để đọc content-type
        await res.arrayBuffer().catch(() => null)
        res = await fetchTimeout(
          safe.toString(),
          { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'manual' },
          MEDIA_PROBE_TIMEOUT_MS,
        )
        await res.arrayBuffer().catch(() => null)
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        await res.arrayBuffer().catch(() => null)
        let next: string | null = null
        if (location) {
          try {
            next = new URL(location, safe.toString()).toString()
          } catch {
            next = null
          }
        }
        if (!next || hop === MAX_PROBE_REDIRECTS) {
          throw new OrhError(
            'CONTENT_REJECTED',
            'Link media chuyển hướng quá nhiều lần hoặc không hợp lệ. Hãy dùng link ảnh/video trực tiếp.',
            false,
          )
        }
        current = next
        continue
      }
      break
    }
  } catch (err) {
    if (err instanceof OrhError) throw err
    throw new OrhError(
      'TRANSIENT_NETWORK_ERROR',
      `Không kiểm tra được link media (${err instanceof Error ? err.message : String(err)}). Sẽ thử lại sau.`,
      true,
    )
  }
  // Vòng lặp luôn break (có response) hoặc throw — res chắc chắn đã gán.
  const finalRes = res as Response
  if (finalRes.status >= 400) {
    throw new OrhError(
      'CONTENT_REJECTED',
      `Link media không tải được (HTTP ${finalRes.status}) — link hỏng hoặc đã hết hạn. Kiểm tra lại ô link ảnh/video của content.`,
      false,
    )
  }
  const ct = (finalRes.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (ct.startsWith('video/')) return 'video'
  if (ct.startsWith('image/')) return 'image'
  if (!ct) {
    // Server không trả content-type → đoán theo đuôi file (best effort)
    return detectMediaKind(url)
  }
  throw new OrhError(
    'CONTENT_REJECTED',
    `Link media không phải ảnh/video (server trả về "${ct}"). Instagram chỉ nhận link ảnh/video trực tiếp — đừng dán link trang web (ví dụ trang xem ảnh ibb.co thay vì link i.ibb.co).`,
    false,
  )
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
    private readonly webhook: PublishWebhookService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!workerEnabled()) {
      this.logger.log('Publish worker tắt (PUBLISH_WORKER_ENABLED=false).')
      return
    }
    // Crash recovery: job nào còn 'running' hoặc 'publishing' (instance cũ bị
    // SIGTERM khi deploy) thì trả về 'pending' để xử lý lại.
    // LƯU Ý: 'publishing' nghĩa là provider CÓ THỂ đã nhận bài (crash đúng
    // lúc gọi API). Reset về pending giữ nguyên hành vi crash-recovery cũ
    // (cửa sổ mơ hồ này rất hẹp); còn trường hợp DB hiccup SAU KHI publish
    // thành công (phổ biến hơn nhiều) đã được xử lý triệt để bằng trạng thái
    // 'publish_confirm_pending' — không bao giờ quay về pending.
    try {
      const recovered = await this.prisma.job.updateMany({
        where: { status: { in: [JOB_STATUS.RUNNING, JOB_STATUS.PUBLISHING] } },
        data: { status: JOB_STATUS.PENDING, nextRunAt: null },
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
      // Nhánh 1 — xác minh sau publish: job 'publish_confirm_pending' có thể
      // đã được đăng nhưng worker chưa ghi 'done'. KHÔNG BAO GIỜ publish lại
      // từ nhánh này (chống đăng trùng P0): chỉ verify (nếu connector hỗ
      // trợ) rồi đánh dấu done.
      const unconfirmed = await this.prisma.job.findMany({
        where: { status: JOB_STATUS.PUBLISH_CONFIRM_PENDING },
        take: batchSize(),
        select: { id: true },
      })
      for (const { id } of unconfirmed) {
        await this.confirmPublish(id).catch((err: unknown) => {
          this.logger.error(
            `Không xác minh được job ${id} (publish_confirm_pending): ${(err as Error).message}`,
          )
        })
      }
      // Nhánh 2 — job chờ publish như cũ.
      const candidates = await this.prisma.job.findMany({
        where: {
          status: JOB_STATUS.PENDING,
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
        },
        orderBy: { nextRunAt: 'asc' },
        take: batchSize(),
        select: { id: true },
      })
      for (const { id } of candidates) {
        // Claim nguyên tử: chỉ instance nào đổi được status mới sở hữu job
        const claimed = await this.prisma.job.updateMany({
          where: { id, status: JOB_STATUS.PENDING },
          data: { status: JOB_STATUS.RUNNING, attempts: { increment: 1 }, lastError: null },
        })
        if (claimed.count === 1) {
          await this.processJob(id).catch(async (err: unknown) => {
            // Lỗi ngoài dự kiến (thường là DB fail giữa chừng khi update status).
            this.logger.error(`Lỗi không mong đợi khi xử lý job ${id}: ${(err as Error).message}`)
            try {
              // Job còn 'running': chưa gọi provider → về pending an toàn.
              await this.prisma.job.updateMany({
                where: { id, status: JOB_STATUS.RUNNING },
                data: { status: JOB_STATUS.PENDING, nextRunAt: null },
              })
              // Job đang 'publishing': provider CÓ THỂ đã nhận bài → TUYỆT ĐỐI
              // không về pending; chuyển sang 'publish_confirm_pending' để
              // tick sau xác minh rồi đánh dấu done (không publish lại).
              const moved = await this.prisma.job.updateMany({
                where: { id, status: JOB_STATUS.PUBLISHING },
                data: {
                  status: JOB_STATUS.PUBLISH_CONFIRM_PENDING,
                  lastError:
                    'Worker gặp lỗi không mong đợi giữa lúc publish — cần xác minh, không publish lại.',
                },
              })
              if (moved.count > 0) {
                this.logger.warn(
                  `Job ${id} kẹt ở 'publishing' khi worker lỗi → chuyển sang 'publish_confirm_pending'.`,
                )
              }
            } catch (resetErr) {
              this.logger.error(
                `Không reset được job ${id} về pending: ${(resetErr as Error).message}`,
              )
            }
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

    // Nhánh xác minh sau publish: bài CÓ THỂ đã được đăng nhưng worker chưa
    // ghi 'done'. KHÔNG BAO GIỜ publish lại từ nhánh này.
    if (job.status === JOB_STATUS.PUBLISH_CONFIRM_PENDING) {
      await this.confirmPublish(jobId)
      return
    }

    try {
      const { connector, input } = await this.preparePublishInput(job)

      // CHỐNG ĐĂNG TRÙNG (P0): đánh dấu 'publishing' TRƯỚC KHI gọi provider.
      // Nếu connector.publish() thành công nhưng DB hiccup ngay sau đó, job
      // sẽ đi vào 'publish_confirm_pending' — không bao giờ quay về 'pending'.
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JOB_STATUS.PUBLISHING },
      })

      const result = await connector.publish(input)

      // Ghi 'done' trong try/catch RIÊNG: provider đã nhận bài, mọi lỗi DB ở
      // đây đều không được dẫn tới publish lại.
      try {
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: JOB_STATUS.DONE,
            lastError: null,
            providerPostId: result.platformPostId,
          },
        })
      } catch (dbErr) {
        await this.handlePublishSucceededButUnconfirmed(job, result, dbErr)
        return
      }

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
      // Bắn webhook outbound cho Make (Publish Sentinel) — service này không
      // bao giờ throw nên worker an toàn dù webhook chết.
      await this.webhook.notify('publish.succeeded', {
        jobId: job.id,
        contentId: job.contentItemId,
        workspaceId: job.workspaceId,
        platform: job.connection.provider,
        status: JOB_STATUS.DONE,
        platformPostId: result.platformPostId,
        url: result.url,
      })
    } catch (err) {
      const attempts = job.attempts // đã increment lúc claim
      const decision = decideRetry(err, attempts)
      const message = err instanceof Error ? err.message : String(err)
      if (decision.kind === 'retry') {
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: JOB_STATUS.PENDING,
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
        await this.webhook.notify('publish.failed', {
          jobId: job.id,
          contentId: job.contentItemId,
          workspaceId: job.workspaceId,
          platform: job.connection.provider,
          status: decision.status,
          error: message.slice(0, 500),
        })
      }
    }
  }

  /**
   * Xử lý job 'publish_confirm_pending': bài viết CÓ THỂ đã được đăng lên
   * provider nhưng worker chưa kịp ghi 'done' (DB hiccup ngay sau publish).
   *
   * NGUYÊN TẮC BẤT DI BẤT DỊCH: không bao giờ gọi connector.publish() lại
   * từ nhánh này — thà đánh dấu done kèm audit warn còn hơn đăng trùng bài
   * lên Instagram/TikTok.
   */
  private async confirmPublish(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { connection: true },
    })
    if (!job) {
      this.logger.warn(`Job ${jobId} không còn tồn tại, bỏ qua xác minh.`)
      return
    }
    if (job.status !== JOB_STATUS.PUBLISH_CONFIRM_PENDING) return

    const connector = getConnector(job.connection.provider)
    let verified: boolean | null = null
    let verifyNote = 'connector chưa hỗ trợ verify bài đăng'
    if (job.providerPostId && typeof connector.verifyPublish === 'function') {
      try {
        verified = await connector.verifyPublish(
          this.toSharedConnection(job.connection),
          job.providerPostId,
        )
        verifyNote = verified
          ? 'provider xác nhận bài đăng tồn tại'
          : 'provider KHÔNG tìm thấy bài đăng'
      } catch (err) {
        verifyNote = `verify thất bại: ${(err as Error).message}`
      }
    }
    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: JOB_STATUS.DONE, lastError: null },
    })
    // Chỉ đánh dấu content đã publish khi verify không phủ định (verified !== false).
    if (verified !== false && job.contentItemId) {
      await this.prisma.contentItem.update({
        where: { id: job.contentItemId },
        data: { status: 'published' },
      })
    }
    await this.audit.log({
      workspaceId: job.workspaceId,
      actorId: job.workspaceId,
      action: 'content_publish_confirm_pending_resolved',
      provider: job.connection.provider,
      entityType: 'job',
      targetId: job.id,
      result: 'success',
      metadata: {
        contentId: job.contentItemId,
        platformPostId: job.providerPostId,
        verified,
        note:
          `Job từng kẹt ở 'publish_confirm_pending' (có thể đã đăng nhưng chưa ghi done). ` +
          `${verifyNote} — đánh dấu done, KHÔNG publish lại để tránh đăng trùng.`,
      },
    })
    this.logger.warn(`Job ${job.id}: publish_confirm_pending → done (${verifyNote}), không publish lại.`)
  }

  /**
   * Publish đã THÀNH CÔNG phía provider nhưng DB lỗi khi ghi 'done'.
   * Chuyển job sang 'publish_confirm_pending' — TUYỆT ĐỐI không reset về
   * pending (đó chính là lỗi đăng trùng P0). Best-effort ghi audit + webhook
   * để vẫn có dấu vết (2 service này never-throw).
   */
  private async handlePublishSucceededButUnconfirmed(
    job: {
      id: string
      workspaceId: string
      contentItemId: string | null
      connection: { provider: string }
    },
    result: { platformPostId: string; url?: string },
    dbErr: unknown,
  ): Promise<void> {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
    this.logger.error(
      `Job ${job.id} đã publish THÀNH CÔNG phía provider (${result.platformPostId}) nhưng không ghi được 'done': ${msg}. ` +
        `Chuyển sang 'publish_confirm_pending' — TUYỆT ĐỐI không publish lại.`,
    )
    try {
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: JOB_STATUS.PUBLISH_CONFIRM_PENDING,
          providerPostId: result.platformPostId,
          lastError: `Đã đăng bài nhưng chưa ghi nhận done (lỗi DB): ${msg}`.slice(0, 500),
        },
      })
    } catch (innerErr) {
      // DB vẫn lỗi: job kẹt ở 'publishing', lần restart tới crash-recovery sẽ
      // xử lý. Log rõ để on-call thấy.
      this.logger.error(
        `Job ${job.id}: không chuyển được sang 'publish_confirm_pending': ${(innerErr as Error).message}`,
      )
    }
    await this.audit.log({
      workspaceId: job.workspaceId,
      actorId: job.workspaceId,
      action: 'content_publish_succeeded_unconfirmed',
      provider: job.connection.provider,
      entityType: 'job',
      targetId: job.id,
      result: 'success',
      metadata: {
        contentId: job.contentItemId,
        platformPostId: result.platformPostId,
        url: result.url,
        note: 'Provider đã nhận bài nhưng DB lỗi khi ghi done — job sang publish_confirm_pending, tick sau xác minh, không publish lại.',
      },
    })
    await this.webhook.notify('publish.succeeded', {
      jobId: job.id,
      contentId: job.contentItemId,
      workspaceId: job.workspaceId,
      platform: job.connection.provider,
      status: JOB_STATUS.PUBLISH_CONFIRM_PENDING,
      platformPostId: result.platformPostId,
      url: result.url,
    })
  }

  /** Dựng Connection (shared type) từ bản ghi DB — dùng chung cho publish/verify. */
  private toSharedConnection(connection: {
    id: string
    workspaceId: string
    provider: string
    providerUserId: string
    encryptedAccessToken: string
    encryptedRefreshToken: string | null
    expiresAt: Date
    scopesJson: string[]
    status: string
  }): Connection {
    return {
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
  }

  /**
   * Chuẩn bị mọi thứ cho publish (validate, refresh token, probe media, build
   * input) NHƯNG KHÔNG gọi connector.publish() — caller (processJob) sẽ đánh
   * dấu job 'publishing' TRƯỚC rồi mới gọi publish, để chống đăng trùng.
   */
  private async preparePublishInput(job: {
    id: string
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
  }): Promise<{ connector: ReturnType<typeof getConnector>; input: PublishInput }> {
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
    const sharedConnection: Connection = this.toSharedConnection(connection)

    // Token hết hạn → thử refresh một lần trước khi publish
    if (sharedConnection.expiresAt.getTime() < Date.now()) {
      try {
        if (typeof connector.refresh !== 'function') {
          throw new OrhError(
            'PROVIDER_REAUTH_REQUIRED',
            `${connection.provider}: connector chưa hỗ trợ refresh token.`,
            false,
            connection.provider,
          )
        }
        const refreshed = await connector.refresh(sharedConnection)
        const encrypted = encrypt(refreshed.accessToken)
        // Một số provider (TikTok) ROTATE refresh token mỗi lần refresh —
        // phải lưu token mới, nếu không lần refresh kế tiếp sẽ fail.
        const encryptedRefresh = refreshed.refreshToken
          ? encrypt(refreshed.refreshToken)
          : undefined
        await this.prisma.connection.update({
          where: { id: connection.id },
          data: {
            encryptedAccessToken: encrypted,
            ...(encryptedRefresh ? { encryptedRefreshToken: encryptedRefresh } : {}),
            expiresAt: refreshed.expiresAt,
            status: 'active',
            lastError: null,
          },
        })
        sharedConnection.encryptedAccessToken = encrypted
        if (encryptedRefresh) sharedConnection.encryptedRefreshToken = encryptedRefresh
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

    // assetUrl có thể chứa nhiều URL (mỗi dòng một link, cách nhau bởi xuống dòng,
    // dấu phẩy HOẶC dấu chấm phẩy). Nếu người dùng dán liền nhau không có ký tự
    // phân tách (ví dụ khi copy từ ô input một dòng), tự tách theo tiền tố "http".
    const mediaUrls = item.assetUrl
      ? item.assetUrl
          .split(/[\n,;]+/)
          .flatMap((s) => s.split(/(?=https?:\/\/)/g))
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
    // Instagram giới hạn caption 2200 ký tự: tự rút gọn thông minh
    // (cắt ở hết câu, giữ hashtag cuối) thay vì fail job.
    const caption = fitCaptionToPlatformLimit(connection.provider, item.caption)
    if (caption.length !== item.caption.length) {
      this.logger.warn(
        `Caption dài ${item.caption.length} ký tự vượt giới hạn Instagram, ` +
          `đã tự rút gọn còn ${caption.length} ký tự (draft gốc giữ nguyên).`,
      )
    }

    // Probe từng URL trước khi gọi Instagram: fail-fast với message rõ ràng
    // thay vì để Instagram trả lỗi khó hiểu sau nhiều lần retry.
    const mediaKinds: MediaKind[] = []
    for (const u of mediaUrls) {
      mediaKinds.push(await probeMediaUrl(u))
    }
    // Log chẩn đoán: thấy ngay job đăng mấy media, loại gì, tới kênh nào
    // (hữu ích khi đọc log Render — ví dụ phân biệt ảnh vs video MP4 từ Canva).
    this.logger.log(
      `Publish job ${job.id}: ${mediaUrls.length} media [${mediaKinds.join(', ')}] → ${connection.provider}.`,
    )

    const input: PublishInput = {
      connection: sharedConnection,
      caption,
      mediaUrls,
      mediaKinds,
    }
    if (typeof connector.publish !== 'function') {
      // Provider chỉ dùng để tạo nội dung (ví dụ Canva — công cụ thiết kế,
      // không phải mạng xã hội) thì không có khả năng đăng bài trực tiếp.
      throw new OrhError(
        'CONTENT_REJECTED',
        `Kênh ${connection.provider} không hỗ trợ đăng bài trực tiếp (chỉ dùng để tạo/sản xuất nội dung). Hãy chọn Instagram, TikTok hoặc Facebook làm kênh đăng.`,
        false,
        connection.provider,
      )
    }
    // KHÔNG gọi connector.publish() ở đây — caller (processJob) đánh dấu job
    // 'publishing' TRƯỚC rồi mới publish, để chống đăng trùng (P0).
    return { connector, input }
  }
}
