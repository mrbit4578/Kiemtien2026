import { Injectable, Logger } from '@nestjs/common'
import { createHmac } from 'crypto'

export type PublishWebhookEvent = 'publish.succeeded' | 'publish.failed'

export interface PublishWebhookPayload {
  event: PublishWebhookEvent
  jobId: string
  contentId: string | null
  workspaceId: string
  /** Provider đích: instagram | tiktok | facebook */
  platform: string
  /** Trạng thái cuối của job: done | failed | dead_letter */
  status: string
  /** Message lỗi (chỉ khi failed) — đã cắt ngắn ở worker */
  error?: string
  /** ID bài đăng trên nền tảng (chỉ khi succeeded) */
  platformPostId?: string
  url?: string
  at: string
}

export type PublishWebhookData = Omit<PublishWebhookPayload, 'event' | 'at'>

/**
 * Ký payload bằng HMAC-SHA256 để phía nhận (Make) xác thực webhook thật sự
 * từ server mình. Header: `X-KT-Signature: sha256=<hex>`.
 */
export function signPayload(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

const ATTEMPT_TIMEOUT_MS = 10_000
/** Tổng 3 lần thử: thử ngay + 2 lần retry cách nhau 1s, 4s */
const RETRY_DELAYS_MS = [1_000, 4_000]

/**
 * Bắn webhook outbound khi job publish tới trạng thái cuối (done / failed /
 * dead_letter) — để Make.com (scenario Publish Sentinel) phản ứng: báo lỗi,
 * đề xuất retry, hoặc ghi nhận thành công.
 *
 * Thiết kế an toàn cho worker:
 * - Tắt hẳn khi chưa cấu hình MAKE_WEBHOOK_URL (không spam log mỗi lần gọi).
 * - KHÔNG BAO GIỜ throw: webhook chết/retry hết lượt chỉ log warn, worker
 *   vẫn hoàn tất job bình thường.
 */
@Injectable()
export class PublishWebhookService {
  private readonly logger = new Logger(PublishWebhookService.name)

  private get url(): string | undefined {
    const v = process.env.MAKE_WEBHOOK_URL?.trim()
    return v ? v : undefined
  }

  private get secret(): string | undefined {
    const v = process.env.MAKE_WEBHOOK_SECRET?.trim()
    return v ? v : undefined
  }

  async notify(event: PublishWebhookEvent, data: PublishWebhookData): Promise<void> {
    const url = this.url
    if (!url) return
    const payload: PublishWebhookPayload = { ...data, event, at: new Date().toISOString() }
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const secret = this.secret
    if (secret) {
      headers['x-kt-signature'] = signPayload(secret, body)
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return
      } catch (err) {
        const last = attempt >= RETRY_DELAYS_MS.length
        const detail = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `Webhook ${event} (job ${data.jobId}) thất bại lần ${attempt + 1}: ${detail}` +
            (last ? ' — bỏ qua, job vẫn được xử lý bình thường.' : ''),
        )
        if (last) return
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      }
    }
  }
}
