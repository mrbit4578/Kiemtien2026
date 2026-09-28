#!/bin/sh
# Pre-deploy: chạy `prisma migrate deploy` với retry + backoff.
#
# Vì sao cần: migrate cần postgres advisory lock (session-scoped). Khi chạy qua
# pooler của Neon, một session cũ từ deploy trước bị SIGTERM giữa chừng có thể
# vẫn giữ lock, hoặc Neon compute cold-start chậm → hết timeout 10s → P1002
# "Timed out trying to acquire a postgres advisory lock" → deploy fail dù code
# không có vấn đề gì. Retry tự động thay vì bắt người dùng bấm Manual Deploy.
set -u

# Ưu tiên direct (non-pooler) connection cho migrate — Prisma tự dùng directUrl
# trong schema.prisma. Nếu chưa cấu hình DIRECT_DATABASE_URL thì fallback về
# DATABASE_URL để không vỡ deploy hiện tại.
if [ -z "${DIRECT_DATABASE_URL:-}" ]; then
  echo "[migrate] DIRECT_DATABASE_URL chưa set — dùng DATABASE_URL (pooler)."
  export DIRECT_DATABASE_URL="$DATABASE_URL"
fi

cd "$(dirname "$0")/.."

# Tự phục hồi migration từng bị fail giữa chừng (vd sai tên bảng ở lần deploy
# trước): đánh dấu rolled-back để lần deploy này apply lại bản đã sửa.
# `|| true` vì migration có thể không ở trạng thái failed → resolve báo lỗi, bỏ qua.
pnpm exec prisma migrate resolve --rolled-back "2026092402_render_attempts" --schema prisma/schema.prisma 2>/dev/null || true

ATTEMPTS=5
SLEEP_SECS=20
i=1
while [ "$i" -le "$ATTEMPTS" ]; do
  echo "[migrate] attempt $i/$ATTEMPTS"
  if pnpm exec prisma migrate deploy --schema prisma/schema.prisma; then
    echo "[migrate] done"
    exit 0
  fi
  if [ "$i" -lt "$ATTEMPTS" ]; then
    echo "[migrate] failed, sleeping ${SLEEP_SECS}s before retry..."
    sleep "$SLEEP_SECS"
  fi
  i=$((i + 1))
done

echo "[migrate] FAILED after $ATTEMPTS attempts" >&2
exit 1
