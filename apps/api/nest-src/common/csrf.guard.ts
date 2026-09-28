import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { createHash, timingSafeEqual } from 'crypto'
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  getCookieValue,
} from './csrf.middleware'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * CSRF guard — double-submit cookie pattern.
 *
 * Production bắt buộc SameSite=None (FE/BE khác domain) + auth bằng cookie
 * HttpOnly → mọi endpoint đổi trạng thái đều có thể bị trigger cross-site nếu
 * không có CSRF token. Guard này yêu cầu, với request POST/PUT/PATCH/DELETE
 * đã xác thực bằng session cookie, header `x-csrf-token` phải khớp giá trị
 * cookie `orh_csrf` (so bằng timingSafeEqual trên SHA-256 để an toàn khi dài
 * khác nhau).
 *
 * Được miễn kiểm tra:
 * - method an toàn (GET/HEAD/OPTIONS);
 * - request có header X-API-Key hoặc Authorization (auth không dùng cookie);
 * - request CHƯA xác thực qua session (login/register/public — chưa có cookie
 *   để so, và không có session nạn nhân để lợi dụng).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()
    const method = String(req.method ?? 'GET').toUpperCase()

    // 1. Method an toàn → bỏ qua.
    if (SAFE_METHODS.has(method)) return true

    // 2. Auth không dùng cookie (server-to-server X-API-Key hoặc Bearer) → bỏ qua.
    const apiKey = req.headers?.['x-api-key']
    const authz = req.headers?.['authorization']
    if (
      (typeof apiKey === 'string' && apiKey.length > 0) ||
      (typeof authz === 'string' && authz.length > 0)
    ) {
      return true
    }

    // 3. Chưa đăng nhập → bỏ qua. Session chỉ được coi là "đã xác thực" khi có
    //    userId (auth.service set session.userId lúc login/register thành công).
    if (!req.session?.userId) return true

    // 4. Đã xác thực bằng session cookie → bắt buộc token khớp.
    const headerRaw = req.headers?.[CSRF_HEADER_NAME]
    const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw
    const cookieToken = getCookieValue(req, CSRF_COOKIE_NAME)
    const valid =
      typeof headerToken === 'string' &&
      headerToken.length > 0 &&
      typeof cookieToken === 'string' &&
      cookieToken.length > 0 &&
      timingSafeEqual(sha256(headerToken), sha256(cookieToken))
    if (!valid) {
      throw new ForbiddenException('CSRF token không hợp lệ.')
    }
    return true
  }
}
