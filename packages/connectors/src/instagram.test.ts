import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { asInstagramError, cdnProxyUrl, isMediaNotReadyError, publishWithRetry } from './instagram'
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

describe('cdnProxyUrl — proxy ảnh imgbb chậm qua weserv', () => {
  it('URL i.ibb.co → qua images.weserv.nl', () => {
    const out = cdnProxyUrl('https://i.ibb.co/nN9yczDX/anh.png')
    assert.equal(out, 'https://images.weserv.nl/?url=' + encodeURIComponent('i.ibb.co/nN9yczDX/anh.png'))
  })

  it('host khác → giữ nguyên', () => {
    const u = 'https://example.com/anh.png'
    assert.equal(cdnProxyUrl(u), u)
  })

  it('URL lỗi → giữ nguyên, không crash', () => {
    assert.equal(cdnProxyUrl('not-a-url'), 'not-a-url')
  })
})

describe('publishWithRetry — race condition "Media ID is not available" của Meta', () => {
  const notReadyBody = { error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } }
  const mkRes = (ok: boolean, body: unknown) =>
    ({ ok, json: async () => body, status: ok ? 200 : 400 }) as unknown as Response

  it('isMediaNotReadyError: nhận diện code 9007 / subcode 2207027 / message', () => {
    assert.equal(isMediaNotReadyError(notReadyBody), true)
    assert.equal(isMediaNotReadyError({ error: { message: 'Media ID is not available' } }), true)
    assert.equal(isMediaNotReadyError({ error: { message: 'Unsupported post request', code: 100 } }), false)
    assert.equal(isMediaNotReadyError({}), false)
  })

  it('2 lần not-ready rồi ok → thành công sau retry', async () => {
    let calls = 0
    const res = await publishWithRetry(async () => {
      calls++
      return calls < 3 ? mkRes(false, notReadyBody) : mkRes(true, { id: '123' })
    }, 10) // delay 10ms cho test nhanh
    assert.equal(calls, 3)
    assert.equal(res.ok, true)
  })

  it('lỗi khác (không phải race) → fail ngay, không retry', async () => {
    let calls = 0
    await assert.rejects(
      publishWithRetry(async () => {
        calls++
        return mkRes(false, { error: { message: 'Unsupported post request', code: 100 } })
      }),
      /Instagram từ chối ở bước publish/,
    )
    assert.equal(calls, 1)
  })
})
