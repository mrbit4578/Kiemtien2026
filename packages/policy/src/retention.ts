/**
 * Thời gian lưu trữ dữ liệu (ngày).
 * Dùng để cron job / scheduled job tự động xóa.
 */
export const RETENTION_DAYS = {
  token: 0,           // Xóa ngay khi revoke
  auditLog: 730,       // 2 năm
  consentHistory: 1825, // 5 năm
  contentItem: 365,    // 1 năm
  userAccount: 30,     // 30 ngày soft delete → hard delete
} as const

export function isExpired(createdAt: Date, retentionDays: number): boolean {
  const expiry = new Date(createdAt)
  expiry.setDate(expiry.getDate() + retentionDays)
  return new Date() > expiry
}
