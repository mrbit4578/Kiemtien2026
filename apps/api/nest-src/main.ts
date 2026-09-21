import 'reflect-metadata'
import { randomBytes } from 'crypto'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { json } from 'express'
import session from 'express-session'
import helmet from 'helmet'
import { AppModule } from './app.module'

async function bootstrap() {
  // Express adapter (mặc định) — khớp với express types dùng trong controllers
  const app = await NestFactory.create(AppModule)

  // Tin tưởng reverse proxy (Railway/Render terminate TLS phía trước) để
  // cookie `secure` và req.ip hoạt động đúng sau proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', 1)

  // Security headers (thay cho 3 header set thủ công trước đây)
  app.use(helmet())

  // Giới hạn body để chống payload quá lớn
  app.use(json({ limit: '1mb' }))

  // Session server-side qua HttpOnly cookie
  const sessionSecret = process.env.SESSION_SECRET
  if (!sessionSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET chưa được cấu hình — từ chối khởi động ở production.')
    }
    console.warn('[warn] SESSION_SECRET chưa set — dùng secret tạm thời, KHÔNG dùng cho production.')
  }
  const isProd = process.env.NODE_ENV === 'production'
  app.use(
    session({
      secret: sessionSecret ?? randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        // Frontend (Vercel) và backend (Railway/Render) khác domain → request
        // cross-site, nên production cần SameSite=None (bắt buộc kèm Secure).
        // Ghi đè bằng SESSION_SAMESITE nếu deploy cùng domain.
        sameSite:
          (process.env.SESSION_SAMESITE as 'lax' | 'strict' | 'none' | undefined) ??
          (isProd ? 'none' : 'lax'),
        maxAge: 30 * 60 * 1000, // 30 phút
      },
    }),
  )

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )

  // CORS fail-closed: chỉ bật khi APP_URL được cấu hình
  const appUrl = process.env.APP_URL
  if (appUrl) {
    app.enableCors({ origin: [appUrl], credentials: true })
  } else {
    console.warn('[warn] APP_URL chưa set — CORS tắt (fail-closed).')
  }

  // Railway/Render cấp PORT động; API_PORT dành cho tự host thủ công.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000)
  await app.listen(port, '0.0.0.0')
  console.log(`API running on :${port}`)
}

bootstrap()
