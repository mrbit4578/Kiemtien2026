import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * Envelope encryption cho token.
 * Production: thay getKey() bằng KMS (AWS KMS, GCP KMS, Vault).
 *
 * Format: iv(12 bytes) + authTag(16 bytes) + ciphertext
 */

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw || raw.length < 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY phải dài ít nhất 32 ký tự.')
  }
  // Tương thích ngược: chuỗi hex 64 ký tự (32 bytes) dùng trực tiếp;
  // mọi chuỗi bí mật khác được dẫn xuất qua SHA-256 → 32 bytes.
  // Nhờ vậy secret ngẫu nhiên do nền tảng deploy tự sinh vẫn dùng được.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw, 'utf8').digest()
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

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertext, 'base64')

  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

// KHÔNG export raw key. Không log plaintext token.
