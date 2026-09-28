import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * Envelope encryption cho token.
 * Production: thay getKey() bằng KMS (AWS KMS, GCP KMS, Vault).
 *
 * Format: iv(12 bytes) + authTag(16 bytes) + ciphertext
 */

const ALGORITHM = 'aes-256-gcm'

/**
 * Dẫn xuất key 32 bytes từ chuỗi env: chuỗi hex 64 ký tự dùng trực tiếp,
 * mọi chuỗi bí mật khác được dẫn xuất qua SHA-256.
 * Trả về null khi chuỗi thiếu/quá ngắn (để caller quyết định fail-closed).
 */
function getKeyFromEnv(raw: string | undefined): Buffer | null {
  if (!raw || raw.length < 32) return null
  // Tương thích ngược: chuỗi hex 64 ký tự (32 bytes) dùng trực tiếp;
  // mọi chuỗi bí mật khác được dẫn xuất qua SHA-256 → 32 bytes.
  // Nhờ vậy secret ngẫu nhiên do nền tảng deploy tự sinh vẫn dùng được.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw, 'utf8').digest()
}

function getKey(): Buffer {
  const key = getKeyFromEnv(process.env.TOKEN_ENCRYPTION_KEY)
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY phải dài ít nhất 32 ký tự.')
  }
  return key
}

/**
 * Key cũ trong giai đoạn xoay key (quy trình 4 bước: docs/key-rotation.md).
 * Trả về null khi không cấu hình — decrypt() khi đó giữ nguyên behavior cũ
 * (sai key → TokenDecryptError, không retry).
 */
function getPreviousKey(): Buffer | null {
  return getKeyFromEnv(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS)
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Kết hợp: iv | authTag | ciphertext → base64
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * Lỗi giải mã token đã lưu.
 *
 * BỐI CẢNH: Node crypto ném lỗi gốc "Unsupported state or unable to
 * authenticate data" khi AES-GCM verify auth tag thất bại — tức key giải mã
 * không khớp key lúc mã hóa. Nguyên nhân điển hình:
 * - TOKEN_ENCRYPTION_KEY bị đổi/xoay sau khi tài khoản được kết nối (xem
 *   docs/key-rotation.md — KHÔNG xoay key đột ngột), hoặc
 * - token được mã hóa bởi một service/API khác dùng key khác (ví dụ API cũ
 *   trước khi chuyển sang service Docker mới).
 *
 * Trong giai đoạn xoay key (có TOKEN_ENCRYPTION_KEY_PREVIOUS), decrypt() sẽ
 * tự thử lại bằng key cũ trước khi ném lỗi này — xem decrypt() bên dưới.
 *
 * Lỗi này KHÔNG BAO GIỜ tự hết bằng retry — nếu không còn key cũ, cách duy
 * nhất là ngắt kết nối và kết nối lại tài khoản để hệ thống mã hóa token mới
 * bằng key hiện tại. Vì vậy worker phải classify lỗi này là terminal
 * (fail ngay), không retry.
 */
export class TokenDecryptError extends Error {
  constructor() {
    super(
      'Không giải mã được token đã lưu: TOKEN_ENCRYPTION_KEY trên server không khớp ' +
        'với key lúc mã hóa (có thể key đã bị đổi sau khi bạn kết nối tài khoản). ' +
        'Hãy ngắt kết nối (Rút Quyền) và kết nối lại tài khoản để cấp token mới.',
    )
    this.name = 'TokenDecryptError'
  }
}

function decryptWith(key: Buffer, ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64')

  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  } catch {
    // Auth tag không verify được = sai key (hoặc dữ liệu bị sửa) → lỗi rõ
    // nghĩa thay vì message crypto khô khốc của Node.
    throw new TokenDecryptError()
  }
}

/**
 * Giải mã token. Thử TOKEN_ENCRYPTION_KEY trước; nếu thất bại với
 * TokenDecryptError và có TOKEN_ENCRYPTION_KEY_PREVIOUS thì thử lại bằng key
 * cũ (giai đoạn xoay key). encrypt() LUÔN dùng key chính — sau khi chạy script
 * re-encrypt cho toàn bộ DB thì gỡ PREVIOUS để quay về 1 key duy nhất.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  try {
    return decryptWith(key, ciphertext)
  } catch (err) {
    if (!(err instanceof TokenDecryptError)) throw err
    const previousKey = getPreviousKey()
    if (!previousKey) throw err
    return decryptWith(previousKey, ciphertext)
  }
}

// KHÔNG export raw key. Không log plaintext token.
