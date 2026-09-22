import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isBlockedIp, assertSafeUrl, SsrfBlockedError } from './ssrf'

describe('isBlockedIp', () => {
  it('chặn loopback/private/link-local/metadata', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.4.4',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fc00::1',
    ]) {
      assert.equal(isBlockedIp(ip), true, `phải chặn ${ip}`)
    }
  })

  it('cho qua IP công cộng', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '142.250.72.14', '2606:4700:4700::1111']) {
      assert.equal(isBlockedIp(ip), false, `phải cho qua ${ip}`)
    }
  })

  it('fail-closed với chuỗi không phải IP', () => {
    assert.equal(isBlockedIp('not-an-ip'), true)
  })
})

describe('assertSafeUrl', () => {
  it('chặn protocol không phải http/https', async () => {
    await assert.rejects(() => assertSafeUrl('ftp://example.com/x'), SsrfBlockedError)
    await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), SsrfBlockedError)
  })

  it('chặn URL chứa userinfo', async () => {
    await assert.rejects(() => assertSafeUrl('https://user:pass@example.com/'), SsrfBlockedError)
  })

  it('chặn localhost và metadata hostname không cần resolve DNS', async () => {
    await assert.rejects(() => assertSafeUrl('http://localhost:3000/'), SsrfBlockedError)
    await assert.rejects(
      () => assertSafeUrl('http://metadata.google.internal/'),
      SsrfBlockedError,
    )
  })

  it('ném với URL malformed', async () => {
    await assert.rejects(() => assertSafeUrl('::::'), SsrfBlockedError)
  })
})
