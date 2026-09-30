-- Ngách đã dùng: chống lặp lại + vòng kaizen (thuật toán trộn ngách).
CREATE TABLE "niche_picks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'niche',
    "score" INTEGER,
    "rationale" TEXT,
    "source" TEXT NOT NULL DEFAULT 'scan',
    "status" TEXT NOT NULL DEFAULT 'picked',
    "feedback" TEXT,
    "outcome" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "niche_picks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "niche_picks_workspaceId_slug_key" ON "niche_picks"("workspaceId", "slug");
CREATE INDEX "niche_picks_workspaceId_status_idx" ON "niche_picks"("workspaceId", "status");

ALTER TABLE "niche_picks" ADD CONSTRAINT "niche_picks_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
