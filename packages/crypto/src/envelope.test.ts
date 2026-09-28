import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encrypt, decrypt, TokenDecryptError } from './envelope'

const KEY_A = 'a'.repeat(32)
const KEY_B = 'b'.repeat(32)

function withKey(key: string, fn: () => void) {
  const prev = process.env.TOKEN_ENCRYPTION_KEY
  process.env.TOKEN_ENCRYPTION_KEY = key
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env.TOKEN_ENCRYPTION_KEY
    else process.env.TOKEN_ENCRYPTION_KEY = prev
  }
}

describe('envelope encrypt/decrypt', () => {
  it('roundtrip với cùng key', () => {
    withKey(KEY_A, () => {
      const cipher = encrypt('secret-token-123')
      assert.equal(decrypt(cipher), 'secret-token-123')
    })
  })

  it('sai key → TokenDecryptError với message hướng dẫn rõ ràng (không phải message crypto khô khốc)', () => {
    let cipher = ''
    withKey(KEY_A, () => {
      cipher = encrypt('secret-token-123')
    })
    withKey(KEY_B, () => {
      assert.throws(() => decrypt(cipher), (err: unknown) => {
        assert.ok(err instanceof TokenDecryptError)
        assert.ok(!(err as Error).message.includes('Unsupported state'))
        assert.ok((err as Error).message.includes('TOKEN_ENCRYPTION_KEY'))
        assert.ok((err as Error).message.includes('kết nối lại'))
        return true
      })
    })
  })

  it('dữ liệu bị sửa (auth tag sai) → TokenDecryptError', () => {
    withKey(KEY_A, () => {
      const cipher = encrypt('secret-token-123')
      const buf = Buffer.from(cipher, 'base64')
      buf[buf.length - 1] ^= 0xff // lật 1 bit ở ciphertext
      assert.throws(() => decrypt(buf.toString('base64')), TokenDecryptError)
    })
  })
})
