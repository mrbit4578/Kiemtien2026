-- Migration: Kho tri thức RAG (pgvector + full-text search)
-- LƯU Ý: migration này cần extension pgvector (image pgvector/pgvector:pg16).
-- Cột "embedding" kiểu vector(1536) và cột "search" (tsvector generated) được
-- quản lý hoàn toàn bằng SQL này — Prisma schema khai báo embedding là
-- Unsupported("vector(1536)") nên KHÔNG dùng `prisma migrate dev` cho migration
-- này (migrate diff không hỗ trợ Unsupported); dùng `prisma migrate deploy`.

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── documents ──────────────────────────────────────────────────────────────
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "documents_workspaceId_idx" ON "documents"("workspaceId");

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── chunks ─────────────────────────────────────────────────────────────────
CREATE TABLE "chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'text',
    "tokenCount" INTEGER,
    "embedding" vector(1536),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Cột tìm kiếm full-text: tự động sinh từ content, dùng cho sparse retrieval
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chunks_workspaceId_idx" ON "chunks"("workspaceId");
CREATE INDEX "chunks_documentId_idx" ON "chunks"("documentId");
-- Dense retrieval: cosine similarity qua pgvector (HNSW)
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
-- Sparse retrieval: full-text search
CREATE INDEX "chunks_search_gin_idx" ON "chunks" USING gin ("search");

ALTER TABLE "chunks"
    ADD CONSTRAINT "chunks_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── entities (GraphRAG) ────────────────────────────────────────────────────
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT,
    "chunkId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entities_workspaceId_idx" ON "entities"("workspaceId");

ALTER TABLE "entities"
    ADD CONSTRAINT "entities_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entities"
    ADD CONSTRAINT "entities_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── relations (GraphRAG) ───────────────────────────────────────────────────
CREATE TABLE "relations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "relations_workspaceId_idx" ON "relations"("workspaceId");

ALTER TABLE "relations"
    ADD CONSTRAINT "relations_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── communities (GraphRAG) ─────────────────────────────────────────────────
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "entityIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "communities_workspaceId_idx" ON "communities"("workspaceId");

ALTER TABLE "communities"
    ADD CONSTRAINT "communities_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
