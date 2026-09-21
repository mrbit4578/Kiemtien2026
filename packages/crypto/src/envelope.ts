import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Envelope encryption cho token.
 * Production: thay getKey() bằng KMS (AWS KMS, GCP KMS, Vault).
 *
 * Format: iv(12 bytes) + authTag(16 bytes) + ciphertext
 */

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length < 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 chars).')
  }
  return Buffer.from(hex, 'hex')
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
