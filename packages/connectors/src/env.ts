/**
 * Đọc env var bắt buộc cho OAuth — fail-fast với message rõ ràng.
 *
 * Trước đây code dùng `process.env.X!` (non-null assertion): khi env var
 * thiếu, giá trị `undefined` bị ép thành chuỗi "undefined" và nhét vào
 * authorization URL (`client_id=undefined`), đẩy user sang trang lỗi khó
 * hiểu của provider (Google 401 invalid_client, Facebook "ID ứng dụng không
 * hợp lệ", TikTok "client_key", GitHub 404...). Helper này throw ngay trên
 * server để API trả 503 với message tiếng Việt, user biết phải cấu hình gì.
 */
export class OAuthNotConfiguredError extends Error {
  readonly provider: string
  readonly missingVar: string

  constructor(provider: string, missingVar: string) {
    super(
      `OAuth chưa được cấu hình cho "${provider}": thiếu biến môi trường ${missingVar} ` +
        `trên server. Hãy thêm ${missingVar} vào Environment Variables của API service rồi deploy lại.`,
    )
    this.name = 'OAuthNotConfiguredError'
    this.provider = provider
    this.missingVar = missingVar
  }
}

/**
 * Lấy env var, throw OAuthNotConfiguredError nếu thiếu hoặc rỗng.
 * Gọi tại thời điểm dùng (call-time), không phải module-load, để test
 * có thể set/unset env linh hoạt.
 */
export function requiredEnv(provider: string, name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new OAuthNotConfiguredError(provider, name)
  return v.trim()
}
