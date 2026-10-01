-- Kaizen A01/A03 (audit 01/10/2026): cột provenance cho embedding namespace.
-- Dense search chỉ so sánh vector cùng namespace "embedding-v1:<provider>:<model>:1536".
-- Vector legacy giữ NULL → bị loại khỏi dense search nhưng vẫn tìm bằng sparse full-text.
-- KHÔNG gán namespace cho vector cũ bằng cách đoán — cần job re-embed riêng (backlog B02).

ALTER TABLE "chunks" ADD COLUMN "embeddingSpace" TEXT;

CREATE INDEX "chunks_workspaceId_embeddingSpace_idx" ON "chunks"("workspaceId", "embeddingSpace");
