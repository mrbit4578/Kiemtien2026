/**
 * Redact secret trong URL — dùng cho log và thông báo lỗi.
 *
 * BỐI CẢNH: một số endpoint của Meta (đổi/refresh Instagram long-lived token)
 * chỉ được document dạng GET với client_secret/access_token nằm trong query
 * string — không có phiên bản POST body. Secret không bao giờ qua browser
 * (server-to-server), nhưng vẫn có thể lọt vào log nếu error message chứa URL.
 * Helper này che các param nhạy cảm thành '[redacted]' trước khi URL xuất hiện
 * ở bất kỳ nơi nào ngoài request thật.
 *
 * LƯU Ý: apps/api đã có redactUrlSecrets() trong common/safe-fetch.ts, nhưng
 * packages/connectors không được import ngược từ apps/* (hướng phụ thuộc),
 * nên helper này tồn tại độc lập ở đây.
 */

const SENSITIVE_QUERY_PARAMS = new Set([
  'client_secret',
  'client_id', // che luôn để URL log không lộ định danh app (defense in depth)
  'appsecret_proof',
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'api_key',
  'apikey',
  'key',
  'token',
  'secret',
  'password',
])

/**
 * Trả về bản sao của URL với giá trị các query param nhạy cảm đã bị che.
 * URL không parse được → trả về chuỗi thay thế an toàn (không bao giờ trả
 * nguyên văn vì có thể chứa secret).
 */
export function sanitizeUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return '[unparseable-url]'
  }
  let changed = false
  for (const name of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_QUERY_PARAMS.has(name.toLowerCase())) {
      url.searchParams.set(name, '[redacted]')
      changed = true
    }
  }
  return changed ? url.toString() : rawUrl
}
