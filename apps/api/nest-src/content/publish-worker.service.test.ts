import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeBackoffMs, decideRetry } from './publish-worker.service'
import { OrhError } from '@orh/shared'

describe('computeBackoffMs', () => {
  it('backoff mũ: 30s, 60s, 120s cho attempts 1,2,3', () => {
    assert.equal(computeBackoffMs(1, false), 30_000)
    assert.equal(computeBackoffMs(2, false), 60_000)
    assert.equal(computeBackoffMs(3, false), 120_000)
  })

  it('trần 30 phút', () => {
    assert.equal(computeBackoffMs(100, false), 30 * 60_000)
  })

  it('rate limit → backoff 1h bất kể attempts', () => {
    assert.equal(computeBackoffMs(1, true), 60 * 60_000)
    assert.equal(computeBackoffMs(4, true), 60 * 60_000)
  })
})

describe('decideRetry', () => {
  it('lỗi retryable + còn lượt → retry với delay', () => {
    const d = decideRetry(new OrhError('TRANSIENT_NETWORK_ERROR', 'timeout', true), 1)
    assert.equal(d.kind, 'retry')
    if (d.kind === 'retry') assert.ok(d.delayMs > 0)
  })

  it('lỗi retryable nhưng hết lượt → dead_letter', () => {
    const d = decideRetry(new OrhError('TRANSIENT_NETWORK_ERROR', 'timeout', true), 5)
    assert.deepEqual(d, { kind: 'terminal', status: 'dead_letter' })
  })

  it('lỗi vĩnh viễn (CONTENT_REJECTED) → failed ngay', () => {
    const d = decideRetry(new OrhError('CONTENT_REJECTED', 'bị từ chối', false), 1)
    assert.deepEqual(d, { kind: 'terminal', status: 'failed' })
  })

  it('lỗi không phải OrhError → failed ngay', () => {
    const d = decideRetry(new Error('unexpected'), 2)
    assert.deepEqual(d, { kind: 'terminal', status: 'failed' })
  })

  it('RATE_LIMITED → retry với backoff dài khi còn lượt', () => {
    const d = decideRetry(new OrhError('RATE_LIMITED', 'limit', false), 2)
    assert.equal(d.kind, 'retry')
    if (d.kind === 'retry') assert.equal(d.delayMs, 60 * 60_000)
  })

  it('RATE_LIMITED hết lượt → dead_letter', () => {
    const d = decideRetry(new OrhError('RATE_LIMITED', 'limit', false), 5)
    assert.deepEqual(d, { kind: 'terminal', status: 'dead_letter' })
  })
})
