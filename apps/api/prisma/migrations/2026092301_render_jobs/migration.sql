-- Migration: RenderJob — hàng đợi video render bằng Concat engine headless.
-- Chạy bằng `prisma migrate deploy` như các migration trước.

CREATE TABLE "render_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "specJson" TEXT NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "concatJob" TEXT,
    "outputPath" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "render_jobs_workspaceId_createdAt_idx" ON "render_jobs"("workspaceId", "createdAt");

ALTER TABLE "render_jobs"
    ADD CONSTRAINT "render_jobs_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
