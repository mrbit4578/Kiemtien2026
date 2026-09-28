-- Session đăng nhập (express-session) lưu DB thay vì MemoryStore.
-- Fix "tự động thoát": Render restart/redeploy làm mất session trong RAM.
CREATE TABLE "sessions" (
    "sid" TEXT NOT NULL,
    "sess" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");
