import { createHash, createHmac } from 'crypto'

/**
 * Pepper cho các hàm hash một chiều (emailHash, ipHash).
 *
 * VÌ SAO CẦN PEPPER: emailHash/ipHash trước đây là SHA-256 unsalted — nếu DB
 * lộ, kẻ tấn công dictionary/brute-force được email (không gian email thấp)
 * và toàn bộ IPv4 (2^32). HMAC-SHA256 với pepper bí mật phía server khiến
 * việc này bất khả thi khi không có pepper.
 *
 * QUY TẮC VẬN HÀNH:
 * - HASH_PEPPER phải dài ít nhất 16 ký tự (khuyến nghị ≥ 32, ngẫu nhiên).
 * - Production thiếu HASH_PEPPER → getHashPepper() throw → AuthService
 *   từ chối boot (fail-closed). Xem AuthService.onModuleInit().
 * - KHÔNG BAO GIỜ xoay/thay đổi HASH_PEPPER trên DB đang chạy nếu chưa có
 *   kế hoạch migration: mọi lookup user (login/register/OAuth) đều phụ thuộc
 *   pepper hiện tại. Đổi pepper đột ngột = toàn bộ user không đăng nhập được.
 */

let devWarned = false

/** Đọc pepper; fail-closed ở production, warn + giá trị yếu ở dev/test. */
export function getHashPepper(): string {
  const pepper = process.env.HASH_PEPPER
  if (pepper && pepper.length >= 16) return pepper

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[security] HASH_PEPPER chưa được cấu hình (hoặc ngắn hơn 16 ký tự). ' +
        'Hãy tạo chuỗi ngẫu nhiên dài ít nhất 32 ký tự và set env HASH_PEPPER ' +
        'trước khi boot production. Server từ chối khởi động để fail-closed.',
    )
  }

  if (!devWarned) {
    devWarned = true
    console.warn(
      '[security] HASH_PEPPER chưa được set — đang dùng giá trị mặc định YẾU, ' +
        'chỉ chấp nhận được cho dev/test. Production thiếu HASH_PEPPER sẽ từ chối boot.',
    )
  }
  return 'dev-only-insecure-pepper-do-not-use-in-production'
}

/** Chuẩn hóa email trước khi hash: lowercase + trim (1 email → 1 user). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Hash email chuẩn hóa bằng HMAC-SHA256(pepper) — dùng cho mọi dữ liệu MỚI
 * (register, login lookup, OAuth callback).
 */
export function hashEmail(email: string): string {
  return createHmac('sha256', getHashPepper()).update(normalizeEmail(email), 'utf8').digest('hex')
}

/**
 * Hash email legacy (SHA-256 unsalted) — CHỈ dùng để lookup migration từ DB
 * cũ. KHÔNG dùng cho dữ liệu mới, không dùng để tạo bản ghi.
 */
export function hashEmailLegacy(email: string): string {
  return createHash('sha256').update(normalizeEmail(email), 'utf8').digest('hex')
}

/**
 * Hash peppered cho định danh không-phải-email (synthetic OAuth id
 * `${provider}:${providerUserId}`, IP). Không chuẩn hóa case — caller tự quyết.
 */
export function hashOpaque(value: string): string {
  return createHmac('sha256', getHashPepper()).update(value, 'utf8').digest('hex')
}

/** Legacy unsalted cho định danh không-phải-email — chỉ dùng migration. */
export function hashOpaqueLegacy(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Hash IP (không lưu IP đầy đủ — privacy). Dùng cho bản ghi consent mới. */
export function hashIp(ip: string): string {
  return hashOpaque(ip)
}

/** Legacy unsalted cho IP — chỉ dùng migration (hiện chưa có bảng nào query theo ipHash). */
export function hashIpLegacy(ip: string): string {
  return hashOpaqueLegacy(ip)
}
