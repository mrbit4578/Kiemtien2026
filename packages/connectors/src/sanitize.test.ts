import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeUrl } from './sanitize'

describe('sanitizeUrl', () => {
  it('che client_secret và access_token trong query string', () => {
    const out = sanitizeUrl(
      'https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=S3CR3T&access_token=TOK123',
    )
    assert.ok(!out.includes('S3CR3T'), 'client_secret lọt ra ngoài')
    assert.ok(!out.includes('TOK123'), 'access_token lọt ra ngoài')
    assert.ok(out.includes('client_secret=%5Bredacted%5D') || out.includes('client_secret=[redacted]'))
    assert.ok(out.includes('grant_type=ig_exchange_token'), 'param thường phải giữ nguyên')
  })

  it('che code, appsecret_proof, api key (không phân biệt hoa thường)', () => {
    const out = sanitizeUrl('https://x.test/cb?CODE=abc&AppSecret_Proof=zzz&KEY=k1')
    assert.ok(!out.includes('abc'))
    assert.ok(!out.includes('zzz'))
    assert.ok(!out.includes('k1'))
  })

  it('URL không có param nhạy cảm → trả nguyên văn', () => {
    const u = 'https://graph.instagram.com/me?fields=id,username'
    assert.equal(sanitizeUrl(u), u)
  })

  it('URL không parse được → không trả nguyên văn', () => {
    assert.equal(sanitizeUrl('not a url at all {{{'), '[unparseable-url]')
  })
})
