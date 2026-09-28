import { Store, type SessionData } from 'express-session'
import type { PrismaService } from '../prisma/prisma.service'

/**
 * Session store lưu vào PostgreSQL qua Prisma — thay thế MemoryStore mặc định
 * của express-session.
 *
 * Vấn đề đã fix: MemoryStore giữ session trong RAM của process. Mỗi lần Render
 * redeploy/restart (deploy mới, scale, OOM...) là toàn bộ user bị logout dù
 * cookie còn hạn — đúng hiện tượng "tự động thoát" user báo. Lưu DB thì
 * session sống sót qua restart.
 *
 * Lưu ý privacy: cột `sess` chỉ chứa payload JSON của express-session
 * (userId, workspaceId, oauthPending gồm codeVerifier/state). Không chứa
 * password, token hay secret — các secret nằm ở nơi khác (vault/DB mã hóa).
 */
export class PrismaSessionStore extends Store {
  private cleanupTimer?: NodeJS.Timeout

  constructor(private readonly prisma: PrismaService) {
    super()
    // Dọn session hết hạn mỗi giờ — tránh bảng sessions phình vô hạn.
    // unref() để timer không giữ process khi test/unit chạy xong.
    this.cleanupTimer = setInterval(() => {
      this.prisma.session
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch(() => {
          /* dọn dẹp nền: lỗi thì bỏ qua, lần sau dọn tiếp */
        })
    }, 60 * 60 * 1000)
    this.cleanupTimer.unref?.()
  }

  /** Dừng timer dọn dẹp (dùng khi shutdown/test). */
  stopCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
  }

  get(sid: string, cb: (err: unknown, session?: SessionData | null) => void): void {
    this.prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row || row.expiresAt.getTime() <= Date.now()) {
          // Hết hạn (hoặc không tồn tại): xóa luôn nếu có rồi báo miss
          if (row) this.prisma.session.delete({ where: { sid } }).catch(() => {})
          cb(null, null)
          return
        }
        try {
          cb(null, JSON.parse(row.sess))
        } catch {
          cb(null, null)
        }
      })
      .catch((err: unknown) => cb(err))
  }

  set(
    sid: string,
    sess: SessionData,
    cb?: (err?: unknown) => void,
  ): void {
    // express-session truyền cookie.expires (Date) hoặc cookie.maxAge
    const cookie = sess.cookie
    let expiresAt: Date
    if (cookie?.expires) {
      expiresAt = new Date(cookie.expires)
    } else if (cookie?.maxAge) {
      expiresAt = new Date(Date.now() + cookie.maxAge)
    } else {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
    this.prisma.session
      .upsert({
        where: { sid },
        create: { sid, sess: JSON.stringify(sess), expiresAt },
        update: { sess: JSON.stringify(sess), expiresAt },
      })
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err))
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.prisma.session
      .delete({ where: { sid } })
      .then(() => cb?.())
      // Xóa session không tồn tại (P2025) vẫn coi là thành công
      .catch((err: unknown) =>
        cb?.(err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2025' ? undefined : err),
      )
  }

  touch(
    sid: string,
    sess: SessionData,
    cb?: (err?: unknown) => void,
  ): void {
    // rolling: true gọi touch mỗi request — chỉ cập nhật expiresAt, không
    // ghi đè payload (tránh race với set()).
    const cookie = sess.cookie
    const expiresAt = cookie?.expires
      ? new Date(cookie.expires)
      : new Date(Date.now() + (cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000))
    this.prisma.session
      .update({ where: { sid }, data: { expiresAt } })
      .then(() => cb?.())
      .catch(() => cb?.())
  }
}
