import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'crypto'

export interface ApiKeyEntry {
  name: string
  key: string
  workspaceId: string
}

/**
 * API key cho server-to-server (Make.com, cron ngoài, ...).
 *
 * Bối cảnh: API hiện tại auth bằng session cookie (đăng nhập qua web).
 * Integration chạy headless không giữ session được → dùng header `X-API-Key`.
 *
 * Cấu hình qua env INTEGRATION_API_KEYS, mỗi entry một integration:
 *   INTEGRATION_API_KEYS="make:<key-hex>:<workspaceId>,zapier:<key-hex>:<workspaceId>"
 * Tạo key bằng: `openssl rand -hex 32` (key không chứa dấu phẩy/dấu hai chấm).
 *
 * Hành vi (fail-closed, không phá flow cũ):
 * - Không có header X-API-Key → cho qua (request đi tiếp flow session như cũ).
 * - Có header + key hợp lệ → tiêm workspaceId vào session để
 *   `requireWorkspaceId(session)` ở các controller hoạt động mà không cần
 *   sửa từng handler; gắn `req.apiKeyName` để trace.
 * - Có header + key sai → 401 ngay (không fallback sang session để tránh
 *   nhầm lẫn khi key bị gõ sai/thiếu).
 */
export function parseApiKeys(raw: string | undefined): ApiKeyEntry[] {
  if (!raw) return []
  const entries: ApiKeyEntry[] = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    // name:key:workspaceId — key sinh bằng hex nên không chứa dấu hai chấm
    const first = trimmed.indexOf(':')
    const second = first === -1 ? -1 : trimmed.indexOf(':', first + 1)
    if (first <= 0 || second <= first + 1 || second === trimmed.length - 1) continue
    entries.push({
      name: trimmed.slice(0, first),
      key: trimmed.slice(first + 1, second),
      workspaceId: trimmed.slice(second + 1),
    })
  }
  return entries
}

/** So sánh key bằng timingSafeEqual — chống timing attack, an toàn khi dài khác nhau. */
export function apiKeyMatches(entryKey: string, presented: string): boolean {
  const a = Buffer.from(entryKey, 'utf8')
  const b = Buffer.from(presented, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function lookupApiKey(
  entries: ApiKeyEntry[],
  presented: string,
): ApiKeyEntry | undefined {
  return entries.find((e) => apiKeyMatches(e.key, presented))
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor() {
    const n = parseApiKeys(process.env.INTEGRATION_API_KEYS).length
    if (n > 0) {
      // Chỉ log số lượng, KHÔNG BAO GIỜ log giá trị key.
      console.log(`[api-key] Đã cấu hình ${n} integration API key.`)
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()
    const header = req.headers?.['x-api-key']
    const presented = Array.isArray(header) ? header[0] : header
    if (!presented || typeof presented !== 'string' || presented.length === 0) {
      return true
    }
    const entry = lookupApiKey(parseApiKeys(process.env.INTEGRATION_API_KEYS), presented)
    if (!entry) {
      throw new UnauthorizedException('API key không hợp lệ.')
    }
    if (req.session) {
      req.session.workspaceId = entry.workspaceId
    }
    req.apiKeyName = entry.name
    return true
  }
}
