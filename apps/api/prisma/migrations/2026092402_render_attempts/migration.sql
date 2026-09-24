-- Thêm attempts để chống lặp vô hạn khi job crash-loop (vd OOM giết container,
-- startup recovery chạy lại mãi). Sau 3 lần thử, job được đánh failed hẳn.
ALTER TABLE "RenderJob" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
