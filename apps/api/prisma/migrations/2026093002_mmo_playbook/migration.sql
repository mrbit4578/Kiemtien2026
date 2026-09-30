-- MMO playbook (mmo-ai-tiktok-roadmap-v1): bảng bằng chứng ngách, đề nghị
-- mua (cơ chế thu nhập), số liệu hiệu quả từng video; mở rộng claim ledger
-- (đoạn căn cứ / cảnh minh họa / mã nguồn kịch bản) và checklist xuất bản.

CREATE TABLE "niche_evidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nicheSlug" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "market" TEXT,
    "audience" TEXT,
    "questionText" TEXT NOT NULL,
    "url" TEXT,
    "metricSeen" TEXT,
    "metricNotProven" TEXT,
    "contentIdea" TEXT,
    "relatedOffer" TEXT,
    "checkResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "niche_evidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "niche_evidence_workspaceId_nicheSlug_idx"
    ON "niche_evidence"("workspaceId", "nicheSlug");
ALTER TABLE "niche_evidence" ADD CONSTRAINT "niche_evidence_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "monetization_offers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "nicheSlug" TEXT,
    "model" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "commissionAmount" INTEGER,
    "commissionCurrency" TEXT NOT NULL DEFAULT 'VND',
    "payoutTerms" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monetization_offers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "monetization_offers_workspaceId_idx"
    ON "monetization_offers"("workspaceId");
CREATE INDEX "monetization_offers_projectId_idx"
    ON "monetization_offers"("projectId");
ALTER TABLE "monetization_offers" ADD CONSTRAINT "monetization_offers_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "video_economics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "costCash" INTEGER NOT NULL DEFAULT 0,
    "hoursWorked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "watchTimeSec" INTEGER,
    "completionRate" DOUBLE PRECISION,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "eligibleOrders" INTEGER NOT NULL DEFAULT 0,
    "commissionReceived" INTEGER NOT NULL DEFAULT 0,
    "organic" BOOLEAN NOT NULL DEFAULT true,
    "postedAt" TIMESTAMP(3),
    "utm" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_economics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "video_economics_projectId_key" ON "video_economics"("projectId");
CREATE INDEX "video_economics_workspaceId_idx" ON "video_economics"("workspaceId");
ALTER TABLE "video_economics" ADD CONSTRAINT "video_economics_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "video_projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_economics" ADD CONSTRAINT "video_economics_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Claim ledger: đoạn căn cứ + cảnh minh họa + mã nguồn kịch bản.
ALTER TABLE "video_claims" ADD COLUMN "evidenceExcerpt" TEXT;
ALTER TABLE "video_claims" ADD COLUMN "sceneRef" TEXT;
ALTER TABLE "video_claims" ADD COLUMN "scriptCode" TEXT;

-- Project: checklist tuân thủ trước xuất bản (JSON).
ALTER TABLE "video_projects" ADD COLUMN "complianceJson" TEXT;
