/**
 * SSRF guard cho tool fetch_url — fail-closed.
 *
 * Chặn: loopback, private (RFC 1918), link-local/metadata (169.254.0.0/16),
 * CGNAT/shared (100.64.0.0/10), dải reserved, IPv6 private/link-local/loopback.
 * DNS resolve thất bại → chặn luôn (fail-closed), vì không xác minh được đích đến.
 */
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

const BLOCKED_V4 = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8', // RFC 1918
  '100.64.0.0/10', // CGNAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local + cloud metadata
  '172.16.0.0/12', // RFC 1918
  '192.0.0.0/24', // IETF reserved
  '192.0.2.0/24', // TEST-NET-1
  '192.168.0.0/16', // RFC 1918
  '198.18.0.0/15', // benchmark
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved
]

const BLOCKED_V6 = [
  '::1/128', // loopback
  '::/128', // unspecified
  'fc00::/7', // unique local
  'fe80::/10', // link-local
  'ff00::/8', // multicast
]

const blockList = new BlockList()
for (const subnet of [...BLOCKED_V4, ...BLOCKED_V6]) {
  const [addr, prefix] = subnet.split('/')
  blockList.addSubnet(addr, Number(prefix), isIP(addr) === 6 ? 'ipv6' : 'ipv4')
}

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`URL bị chặn vì lý do bảo mật: ${reason}`)
    this.name = 'SsrfBlockedError'
  }
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 0) return true // không phải IP hợp lệ → chặn
  return blockList.check(ip, family === 6 ? 'ipv6' : 'ipv4')
}

/**
 * Validate URL trước khi fetch. Trả về URL đã parse nếu an toàn,
 * ném SsrfBlockedError nếu không. Fail-closed ở mọi nhánh.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SsrfBlockedError('URL không hợp lệ')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`chỉ cho phép http/https, nhận được "${url.protocol}"`)
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError('URL chứa thông tin đăng nhập')
  }

  const host = url.hostname.toLowerCase()
  // Chặn hostname nguy hiểm ở dạng chữ trước khi resolve DNS
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    throw new SsrfBlockedError(`hostname "${host}" không được phép`)
  }

  // Resolve DNS rồi kiểm tra IP thật — chống DNS rebinding cơ bản.
  // Lookup thất bại → fail-closed.
  let address: string
  try {
    ;({ address } = await lookup(host))
  } catch {
    throw new SsrfBlockedError(`không resolve được hostname "${host}"`)
  }
  if (isBlockedIp(address)) {
    throw new SsrfBlockedError(`đích đến resolve ra IP nội bộ/bị cấm (${address})`)
  }
  return url
}
