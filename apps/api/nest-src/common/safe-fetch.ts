/**
 * safe-fetch — lớp transport an toàn cho mọi request server → internet.
 *
 * - resolveSafeEndpoint(): validate URL + resolve DNS, yêu cầu TẤT CẢ IP
 *   resolve được đều an toàn (chống DNS rebinding dạng multi-answer).
 * - fetchPinnedText(): kết nối TCP CHỈ tới IP đã kiểm duyệt (DNS pinning qua
 *   option `lookup` của http/https) — SNI và verify cert vẫn dùng hostname gốc.
 * - fetchPinnedWithRedirects(): follow redirect nhưng mỗi hop đều re-validate.
 * - fetchTimeout(): timeout thật sự settle bằng Promise.race (kể cả khi
 *   AbortSignal bị bỏ qua).
 * - redactUrlSecrets(): che giá trị query param nhạy cảm trong log/message.
 *
 * Mọi nhánh đều fail-closed: không xác minh được đích đến → chặn.
 */
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
} from 'node:http'
import { request as httpsRequest } from 'node:https'

// ─── IP blocklist ────────────────────────────────────────────────────────────

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

// ─── Validate + resolve ──────────────────────────────────────────────────────

export interface SafeEndpoint {
  url: URL
  /** IP đã kiểm duyệt — transport chỉ được nối tới IP này (DNS pinning). */
  address: string
  family: 4 | 6
}

/**
 * Validate URL và resolve DNS. Ném SsrfBlockedError nếu không an toàn.
 * Fail-closed ở mọi nhánh.
 */
export async function resolveSafeEndpoint(rawUrl: string): Promise<SafeEndpoint> {
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

  // Resolve TẤT CẢ IP và yêu cầu mọi IP đều an toàn — chống DNS rebinding
  // dạng multi-answer (1 IP sạch + 1 IP nội bộ trong cùng response DNS).
  let records: Array<{ address: string; family: number }>
  try {
    records = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new SsrfBlockedError(`không resolve được hostname "${host}"`)
  }
  if (records.length === 0) {
    throw new SsrfBlockedError(`không resolve được hostname "${host}"`)
  }
  for (const r of records) {
    if (isBlockedIp(r.address)) {
      throw new SsrfBlockedError(`đích đến resolve ra IP nội bộ/bị cấm (${r.address})`)
    }
  }
  const first = records[0]
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 }
}

/** Giữ tương thích ngược: chỉ trả về URL đã validate (không pin DNS). */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  return (await resolveSafeEndpoint(rawUrl)).url
}

// ─── fetchTimeout: timeout thật sự settle ────────────────────────────────────

/**
 * fetch với timeout. Dùng Promise.race nên promise LUÔN settle/reject đúng
 * hẹn kể cả khi fetch bỏ qua AbortSignal; đồng thời abort signal để giải
 * phóng socket bên dưới.
 */
export async function fetchTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort()
      reject(new Error(`Hết thời gian chờ request (${ms}ms)`))
    }, ms)
    timer.unref()
  })
  try {
    return await Promise.race([fetch(url, { ...init, signal: ctrl.signal }), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ─── Pinned transport (http/https + lookup) ──────────────────────────────────

export interface PinnedFetchOptions {
  timeoutMs: number
  maxBytes: number
  headers?: Record<string, string>
}

export interface PinnedFetchResult {
  status: number
  contentType: string
  /** Có mặt khi server trả 3xx (không tự follow ở tầng này). */
  location?: string
  text: string
  truncated: boolean
}

/**
 * GET tới SafeEndpoint với DNS pinning: option `lookup` ép TCP nối đúng IP
 * đã kiểm duyệt; SNI và verify certificate vẫn dùng hostname gốc nên TLS
 * không bị suy yếu. Không follow redirect (trả location cho caller quyết).
 */
export async function fetchPinnedText(
  ep: SafeEndpoint,
  opts: PinnedFetchOptions,
): Promise<PinnedFetchResult> {
  let req: ClientRequest | undefined
  let settled = false
  const task = new Promise<PinnedFetchResult>((resolve, reject) => {
    const done = (r: PinnedFetchResult) => {
      if (settled) return
      settled = true
      resolve(r)
    }
    const fail = (e: unknown) => {
      if (settled) return
      settled = true
      reject(e)
    }
    const lib = ep.url.protocol === 'https:' ? httpsRequest : httpRequest
    req = lib(
      {
        host: ep.url.hostname,
        port: ep.url.port ? Number(ep.url.port) : undefined,
        path: `${ep.url.pathname}${ep.url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OpenRemoteHub/1.0)',
          ...(opts.headers ?? {}),
        },
        // DNS pinning: bất kể DNS trả gì lúc này, chỉ nối tới IP đã duyệt.
        // Node ≥17 gọi custom lookup với { all: true } nên callback nhận
        // MẢNG [{ address, family }] (không phải (err, address, family)).
        lookup: (
          _hostname: string,
          _options: unknown,
          cb: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void,
        ) => cb(null, [{ address: ep.address, family: ep.family }]),
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0
        const contentType = String(res.headers['content-type'] ?? '')
        const location = res.headers.location
        if (status >= 300 && status < 400) {
          res.resume() // xả body rồi trả location, không follow ở tầng này
          done({ status, contentType, location, text: '', truncated: false })
          return
        }
        const chunks: Buffer[] = []
        let received = 0
        res.on('data', (c: Buffer) => {
          if (settled) return
          received += c.length
          if (received > opts.maxBytes) {
            res.destroy()
            done({
              status,
              contentType,
              location,
              text: Buffer.concat(chunks).toString('utf8'),
              truncated: true,
            })
            return
          }
          chunks.push(c)
        })
        res.on('end', () =>
          done({
            status,
            contentType,
            location,
            text: Buffer.concat(chunks).toString('utf8'),
            truncated: false,
          }),
        )
        res.on('error', fail)
      },
    )
    req.on('error', fail)
    req.setTimeout(opts.timeoutMs, () =>
      fail(new Error(`Hết thời gian chờ (${opts.timeoutMs}ms)`)),
    )
    req.end()
  })

  // Race tổng: đảm bảo promise settle đúng hẹn dù socket có treo.
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      req?.destroy()
      if (!settled) {
        settled = true
        reject(new Error(`Hết thời gian chờ (${opts.timeoutMs}ms)`))
      }
    }, opts.timeoutMs)
    timer.unref()
  })
  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Follow redirect một cách an toàn: mỗi hop đều resolve + validate lại từ đầu
 * (chống redirect-chain SSRF: hop sau trỏ vào IP nội bộ sẽ bị chặn).
 */
export async function fetchPinnedWithRedirects(
  rawUrl: string,
  opts: PinnedFetchOptions & { maxRedirects?: number },
): Promise<PinnedFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 3
  let current = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ep = await resolveSafeEndpoint(current)
    const res = await fetchPinnedText(ep, opts)
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (hop === maxRedirects) {
        throw new SsrfBlockedError('quá nhiều chuyển hướng')
      }
      let next: URL
      try {
        next = new URL(res.location, ep.url)
      } catch {
        throw new SsrfBlockedError('URL chuyển hướng không hợp lệ')
      }
      current = next.toString()
      continue
    }
    return res
  }
  throw new SsrfBlockedError('quá nhiều chuyển hướng')
}

// ─── Redact secret trong URL ─────────────────────────────────────────────────

const SENSITIVE_PARAM = /^(token|access_token|id_token|api_?key|client_?secret|secret|password|passwd|pwd|auth|code|session|sessid|sid)$/i

/**
 * Che giá trị của query param nhạy cảm (token, code, key, secret...) để URL
 * có thể xuất hiện an toàn trong log và thông báo lỗi.
 */
export function redactUrlSecrets(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }
  let changed = false
  if (url.username || url.password) {
    url.username = '[redacted]'
    url.password = '[redacted]'
    changed = true
  }
  url.searchParams.forEach((_, key) => {
    if (SENSITIVE_PARAM.test(key)) {
      url.searchParams.set(key, '[redacted]')
      changed = true
    }
  })
  return changed ? url.toString() : raw
}
