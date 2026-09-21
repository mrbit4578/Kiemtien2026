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
  app.use(
    session({
      secret: sessionSecret ?? randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
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

  const port = Number(process.env.API_PORT ?? 4000)
  await app.listen(port, '0.0.0.0')
  console.log(`API running on :${port}`)
}

bootstrap()
