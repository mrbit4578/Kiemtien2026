import type { Job } from 'bullmq'

/**
 * Refresh token job — chạy trước khi token expires
 * Rotation: lưu token mới, xóa token cũ, audit log
 */
export async function refreshTokenHandler(job: Job) {
  const { connectionId } = job.data
  console.log(`[refresh-token] Connection ${connectionId}`)

  // TODO:
  // 1. Fetch connection
  // 2. connector.refresh(connection)
  // 3. encrypt(newTokenSet.accessToken)
  // 4. Cập nhật DB (atomic)
  // 5. Audit log
}
