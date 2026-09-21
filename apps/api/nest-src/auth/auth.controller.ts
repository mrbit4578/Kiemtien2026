import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Res,
  Req,
  Session,
  BadRequestException,
  HttpCode,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto, LoginDto } from './dto'
import type { Response, Request } from 'express'

/**
 * Auth — 2 luồng:
 * 1. Tài khoản email/password: POST /auth/register · POST /auth/login ·
 *    POST /auth/logout · GET /auth/session
 * 2. OAuth (per provider): GET /auth/:provider/start → GET /auth/:provider/callback
 *
 * Lưu ý route: các route tĩnh (register/login/logout/session) PHẢI khai báo
 * trước route động :provider để Express match đúng.
 */

/** Regenerate session id sau khi login/register — chống session fixation. */
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err: unknown) => (err ? reject(err) : resolve()))
  })
}

/** Hủy session hiện tại (logout). */
function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err: unknown) => (err ? reject(err) : resolve()))
  })
}

@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/phút — chống brute-force
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Email/password ──────────────────────────────────────────────────────

  /** POST /auth/register {email, password>=8, name?} — rate limit siết chặt. */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    await regenerateSession(req)
    // req.session mới sau regenerate — KHÔNG dùng object session cũ
    return this.authService.register(dto, req.session as Record<string, any>, req.ip)
  }

  /** POST /auth/login {email, password} — rate limit siết chặt. */
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    await regenerateSession(req)
    return this.authService.login(dto, req.session as Record<string, any>, req.ip)
  }

  /** POST /auth/logout — hủy session server-side. */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Session() session: any) {
    const userId = session?.userId as string | undefined
    const workspaceId = session?.workspaceId as string | undefined
    await destroySession(req)
    // Audit sau khi destroy — chỉ dùng id đã đọc trước đó (không chứa secret)
    if (userId && workspaceId) {
      await this.authService.auditLogout(workspaceId, userId, req.ip)
    }
    return { ok: true }
  }

  /** GET /auth/session — identity endpoint cho frontend. 401 khi chưa đăng nhập. */
  @Get('session')
  async session(@Session() session: any) {
    return this.authService.getSession(session)
  }

  // ─── OAuth ───────────────────────────────────────────────────────────────

  @Get(':provider/start')
  async start(
    @Param('provider') provider: string,
    @Session() session: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Tạo state + PKCE, lưu vào session (server-side, HttpOnly)
    const { url } = await this.authService.startOAuth(provider, session, req.ip)
    // KHÔNG log url (có thể chứa state)
    res.redirect(url)
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Session() session: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code || !state) throw new BadRequestException('Thiếu code hoặc state.')
    // Kiểm tra state, PKCE; đổi code lấy token; lưu connection + consent
    await this.authService.handleCallback(provider, code, state, session, req.ip)
    const appUrl = process.env.APP_URL
    if (!appUrl) throw new BadRequestException('APP_URL chưa được cấu hình.')
    res.redirect(`${appUrl}/settings/connections?connected=${provider}`)
  }
}
