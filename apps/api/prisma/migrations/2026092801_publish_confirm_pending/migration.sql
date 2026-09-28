-- Chống đăng trùng bài (P0) + index cho worker poll.
--
-- 1. jobs.providerPostId (nullable): lưu ID bài đăng trên nền tảng ngay khi
--    provider trả về. Nhánh 'publish_confirm_pending' dùng nó để verify bài
--    đã đăng mà KHÔNG cần publish lại. Không cần backfill: bản ghi cũ giữ NULL.
ALTER TABLE "jobs" ADD COLUMN "providerPostId" TEXT;

-- 2. Index cho worker poll mỗi 15s (where status + orderBy nextRunAt).
--    Trước đây bảng jobs không có index nào → full scan mỗi tick.
CREATE INDEX "jobs_status_nextRunAt_idx" ON "jobs"("status", "nextRunAt");
