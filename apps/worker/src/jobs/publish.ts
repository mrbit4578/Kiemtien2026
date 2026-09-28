import type { Job } from 'bullmq'
import { OrhError } from '@orh/shared'

/**
 * Publish job handler
 *
 * Mỗi job có idempotency_key → không publish trùng.
 * Retry tối đa 3 lần với exponential backoff.
 * Sau 3 lần: dead-letter queue → cảnh báo user.
 */
export async function publishHandler(job: Job) {
  const { connectionId, contentItemId, idempotencyKey } = job.data

  console.log(`[publish] Job ${job.id} | idempotencyKey: ${idempotencyKey}`)

  // TODO:
  // 1. Fetch connection (decrypted token)
  // 2. Fetch content item (phải approved)
  // 3. Kiểm tra idempotency_key chưa dùng
  // 4. Gọi connector.publish()
  // 5. Cập nhật job status + audit log

  // Ví dụ xử lý lỗi có phân loại:
  try {
    // await connector.publish(...)
  } catch (err) {
    if (err instanceof OrhError) {
      if (!err.retryable) {
        // Lỗi không retry được → dead-letter ngay
        throw new Error(`[no-retry] ${err.code}: ${err.message}`)
      }
    }
    throw err // BullMQ sẽ retry
  }
}
