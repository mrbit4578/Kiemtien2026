-- Video Faceless: project pipeline + 3 ledgers (rights/claims/AI register).
-- Spec: docs/faceless-video-system.md
CREATE TABLE "video_projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "series" TEXT,
    "viralSourceUrl" TEXT,
    "sourceNote" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'intake',
    "angle" TEXT,
    "briefJson" TEXT,
    "script" TEXT,
    "caption" TEXT,
    "publishNotes" TEXT,
    "riskScore" INTEGER,
    "riskBreakdown" TEXT,
    "gatesJson" TEXT,
    "contentItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "owner" TEXT,
    "rightsBasis" TEXT NOT NULL,
    "scope" TEXT,
    "proof" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_claims" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "primarySource" TEXT,
    "secondarySource" TEXT,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "video_ai_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "inputSource" TEXT,
    "outputUse" TEXT,
    "category" TEXT NOT NULL,
    "realPerson" BOOLEAN NOT NULL DEFAULT false,
    "labelRequired" BOOLEAN NOT NULL DEFAULT false,
    "labelApplied" BOOLEAN NOT NULL DEFAULT false,
    "consentStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_ai_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "video_projects_workspaceId_updatedAt_idx" ON "video_projects"("workspaceId", "updatedAt");
CREATE INDEX "video_assets_projectId_idx" ON "video_assets"("projectId");
CREATE INDEX "video_claims_projectId_idx" ON "video_claims"("projectId");
CREATE INDEX "video_ai_entries_projectId_idx" ON "video_ai_entries"("projectId");

ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_claims" ADD CONSTRAINT "video_claims_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_ai_entries" ADD CONSTRAINT "video_ai_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "video_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
