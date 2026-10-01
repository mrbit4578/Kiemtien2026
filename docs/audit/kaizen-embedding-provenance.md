# Kaizen tích hợp từ audit 01/10/2026 — embedding provenance + recursive tool validation

**Nhánh:** `feat/audit-kaizen-embedding-agent` (từ `master` @ `057e629`)
**Nguồn:** `docs/KIEMTIEN2026_AUDIT_KAIZEN_HANDOFF.md` (file audit hay upload 01/10/2026)
**Ngày tích hợp:** 01/10/2026

## 1. Đã tích hợp (2 thay đổi đã kiểm chứng từ audit)

### A01/A03 — Embedding provenance gate
- Mới: `apps/api/nest-src/ai/embedding-provenance.ts` — contract namespace
  `embedding-v1:<provider>:<model>:1536`, hàm build/parse/so sánh, gate vector
  (đúng 1536 chiều + mọi phần tử finite). Chuỗi space không chứa secret.
- `ai.service.ts`: `embed()` trả `{ vectors, provenance }`; audit metadata ghi thêm
  `model` + `space` (không log nội dung/key). Model đưa vào hằng số
  `OPENAI_EMBED_MODEL` / `GEMINI_EMBED_MODEL` để namespace luôn khớp model đã gọi.
- `rag.service.ts`:
  - Ingest: mọi batch phải cùng `embeddingSpace`, đổi giữa chừng → fail-closed
    (tài liệu không sang `ready`, không trộn vector). Audit `rag_ingest` ghi `embeddingSpace`.
  - `updateEmbedding()`: ghi vector + namespace trong CÙNG 1 câu UPDATE; gate vector trước khi ghi.
  - `denseSearch()`: thêm điều kiện `c."embeddingSpace" = $3` — chỉ so cosine trong cùng
    namespace; vector legacy (NULL) bị loại khỏi dense nhưng vẫn tìm bằng sparse full-text.
  - `embedQuery()` trả `{ vector, space }`; `hybridRetrieve()` và agentic `vector_search`
    truyền space xuống dense.
- `schema.prisma`: `Chunk.embeddingSpace String?` + `@@index([workspaceId, embeddingSpace])`.
- Migration `2026100101_embedding_provenance`: thêm cột + index. Legacy giữ NULL —
  KHÔNG gán namespace bằng cách đoán (chờ job re-embed backlog B02).

### A02 — Recursive agent tool validation
- `tool-registry.ts`: `validateToolArgs` nay validate ĐỆ QUY qua `validatePropValue` —
  object/array lồng nhau được kiểm tra `required`, `additionalProperties`, `enum`,
  kiểu, giới hạn chuỗi/số, `minItems`/`maxItems`. Path lỗi dạng `clips[0].source`.

## 2. Kiểm thử
- Mới: `embedding-provenance.test.ts` (10 test), thêm 7 test nested vào `tool-registry.test.ts`.
- Chạy: `tsx --test` trên 4 file (provenance, tool-registry, agent-loop, ai-fallback) → **44/44 pass**.
- Typecheck `tsc --noEmit`: không thêm lỗi mới so với baseline (lỗi còn lại là
  `@prisma/client` cũ không khớp schema + 2 lỗi `unknown.name` có sẵn — vấn đề môi trường,
  không do patch này).

## 3. Chưa làm (theo đúng ranh giới của audit)
- **B01 dependencies**: không nâng trong patch này (cần lockfile + kiểm thử tương thích riêng).
- **B02 re-embed**: cần job admin riêng (rate limit, receipt, rollback theo document).
- **B03 worker**: quyết định kiến trúc — cần hay chốt (không chạy 2 worker cùng lúc).
- **B04/B05**: dataset dự báo + live verification trên staging — việc tương lai.
- Không tạo weights/labels giả, không claim doanh thu từ mô phỏng.

## 4. Deploy
1. Merge nhánh này → Render tự chạy migration `2026100101_embedding_provenance`.
2. Sau deploy: tài liệu mới tự có `embeddingSpace`; tài liệu cũ (space NULL) vẫn tìm
   bằng sparse, dense bỏ qua cho đến khi re-embed (B02).
3. Rollback: revert code là đủ — cột mới không ảnh hưởng dữ liệu cũ; KHÔNG xóa cột
   khi đã có dữ liệu mới.
