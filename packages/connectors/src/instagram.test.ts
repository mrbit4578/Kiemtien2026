import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { asInstagramError } from './instagram'
import { OrhError } from '@orh/shared'

describe('asInstagramError — Meta Timeout là lỗi nhất thời', () => {
  it('message "Timeout" của Meta → TRANSIENT_NETWORK_ERROR, retryable=true', () => {
    const err = asInstagramError({ error: { message: 'Timeout' } }, 'tạo container')
    assert.ok(err instanceof OrhError)
    assert.equal(err.code, 'TRANSIENT_NETWORK_ERROR')
    assert.equal(err.retryable, true)
    assert.equal(err.provider, 'instagram')
    // Message tiếng Việt rõ ràng, KHÔNG bê nguyên chữ "Timeout" khô khốc
    assert.ok(!/^Timeout$/.test(err.message))
    assert.match(err.message, /tạo container/)
    assert.match(err.message, /tự thử lại/)
  })

  it('message chứa "timed out" (case-insensitive) → cũng retryable', () => {
    const err = asInstagramError(
      { error: { message: 'The request timed out while fetching media' } },
      'publish',
      500,
    )
    assert.equal(err.code, 'TRANSIENT_NETWORK_ERROR')
    assert.equal(err.retryable, true)
  })

  it('lỗi thật của Meta (không phải timeout) → CONTENT_REJECTED vĩnh viễn, giữ HTTP status', () => {
    const err = asInstagramError(
      { error: { message: 'Invalid image format' } },
      'publish',
      400,
    )
    assert.equal(err.code, 'CONTENT_REJECTED')
    assert.equal(err.retryable, false)
    assert.match(err.message, /HTTP 400/)
    assert.match(err.message, /Invalid image format/)
  })

  it('body lỗi rỗng → message fallback, không crash', () => {
    const err = asInstagramError({}, 'tạo container')
    assert.equal(err.code, 'CONTENT_REJECTED')
    assert.equal(err.retryable, false)
    assert.match(err.message, /không rõ nguyên nhân/)
  })
})
