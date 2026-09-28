import { Redis } from 'ioredis'

/**
 * Tạo Redis connection từ REDIS_URL đầy đủ.
 *
 * ioredis parse trực tiếp URL dạng redis:// / rediss://user:pass@host:port/db
 * nên username, password và TLS (rediss://) đều được giữ nguyên — bản cũ tự
 * parse host/port bằng tay đã làm mất auth/TLS, Redis mở toang (P1).
 *
 * Mỗi Worker/Queue gọi riêng 1 lần — KHÔNG share 1 instance giữa nhiều
 * Worker vì BullMQ dùng blocking connection riêng cho mỗi Worker.
 * BẮT BUỘC maxRetriesPerRequest: null khi tự cấp connection cho BullMQ.
 */
export function createRedisConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })
}
