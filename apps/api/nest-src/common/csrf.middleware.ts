import { randomBytes } from 'crypto'
import type { NextFunction, Request, Response } from 'express'

/** Tên cookie CSRF (double-submit). Frontend đọc cookie này và gửi lại qua header. */
export const CSRF_COOKIE_NAME = 'orh_csrf'
/** Tên header CSRF mà frontend phải gửi kèm mọi request đổi trạng thái. */
export const CSRF_HEADER_NAME = 'x-csrf-token'

/** Sinh token CSRF: 32 byte random → hex (64 ký tự). */
export function newCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Đọc 1 cookie từ header `Cookie` thô (không cần cookie-parser — repo hiện
 * không dùng cookie-parser, `req.cookies` luôn undefined).
 * Trả về undefined nếu không có.
 */
export function getCookieValue(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie
  if (!header || typeof header !== 'string') return undefined
  const prefix = `${name}=`
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length))
      } catch {
        return trimmed.slice(prefix.length)
      }
    }
  }
  return undefined
}

/**
 * Express middleware: đảm bảo mọi response đều set cookie `orh_csrf` nếu
 * client chưa có. Cookie KHÔNG HttpOnly để JS đọc được (double-submit pattern).
 *
 * - production: SameSite=None + Secure (FE/BE khác domain → request cross-site)
 * - dev: SameSite=Lax (chạy http, không cần Secure)
 */
export function csrfCookieMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let token = getCookieValue(req, CSRF_COOKIE_NAME)
  if (!token) {
    token = newCsrfToken()
    const isProd = process.env.NODE_ENV === 'production'
    res.cookie(CSRF_COOKIE_NAME, token, {
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày — cùng vòng đời session
      httpOnly: false, // JS cần đọc để gửi lại qua header
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    })
  }
  // Gắn token vào request để endpoint GET /auth/csrf-token có thể trả về
  // dạng JSON (cần cho frontend cross-domain: JS ở web domain không đọc được
  // cookie do API domain set qua document.cookie).
  ;(req as unknown as { csrfToken?: string }).csrfToken = token
  next()
}

/**
 * Lấy CSRF token của request hiện tại (do csrfCookieMiddleware gắn vào).
 * Dùng cho endpoint JSON phục vụ frontend cross-domain.
 */
export function getRequestCsrfToken(req: Request): string | undefined {
  return (req as unknown as { csrfToken?: string }).csrfToken
}
