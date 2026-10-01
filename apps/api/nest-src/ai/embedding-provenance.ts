/**
 * Embedding provenance — namespace ổn định cho vector pgvector (audit kaizen A01/A03).
 *
 * Vấn đề gốc: dense search dùng mọi vector có `embedding IS NOT NULL`, dù key/provider
 * có thể đã đổi từ OpenAI sang Gemini giữa chừng. Hai không gian vector khác nhau bị
 * trộn trong cùng một workspace → kết quả cosine similarity vô nghĩa.
 *
 * Contract:
 * - Mọi vector ghi vào `chunks` đều mang `embeddingSpace`:
 *   `embedding-v1:<provider>:<model>:<dims>` (vd `embedding-v1:openai:text-embedding-3-small:1536`).
 * - Dense retrieval CHỈ so sánh query với chunk cùng namespace.
 * - Vector legacy (`embeddingSpace IS NULL`) bị loại khỏi dense search, nhưng vẫn
 *   tìm được bằng sparse full-text.
 * - Chuỗi space không chứa secret — chỉ tên provider/model/số chiều — nên an toàn
 *   để log vào audit metadata.
 */

export const EMBEDDING_SCHEMA_VERSION = 'embedding-v1'
/** Số chiều chuẩn của mọi vector trong hệ thống (Gemini tự chuẩn hoá về 1536). */
export const EMBEDDING_DIMS = 1536

/** Model embedding đang dùng cho từng provider (đồng bộ với AiService). */
export const EMBEDDING_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'text-embedding-3-small',
  gemini: 'gemini-embedding-001',
}

export interface EmbeddingProvenance {
  provider: string
  model: string
  dims: number
  /** Namespace ổn định: `embedding-v1:<provider>:<model>:<dims>`. */
  space: string
}

function cleanPart(value: string, label: string): string {
  const v = value.trim().toLowerCase()
  if (!v) throw new Error(`Embedding provenance: ${label} rỗng`)
  if (v.includes(':')) {
    throw new Error(`Embedding provenance: ${label} không được chứa dấu ":" (phá vỡ namespace)`)
  }
  return v
}

/**
 * Dựng namespace cho một cặp provider/model. Ném lỗi khi input không hợp lệ
 * (fail-closed: không tạo namespace mập mờ).
 */
export function buildEmbeddingSpace(
  provider: string,
  model: string,
  dims: number = EMBEDDING_DIMS,
): string {
  const p = cleanPart(provider, 'provider')
  const m = cleanPart(model, 'model')
  if (!Number.isInteger(dims) || dims <= 0) {
    throw new Error('Embedding provenance: dims phải là số nguyên dương')
  }
  return `${EMBEDDING_SCHEMA_VERSION}:${p}:${m}:${dims}`
}

/** Provenance đầy đủ cho một lượt embed. */
export function makeProvenance(
  provider: string,
  model: string,
  dims: number = EMBEDDING_DIMS,
): EmbeddingProvenance {
  const space = buildEmbeddingSpace(provider, model, dims)
  const parsed = parseEmbeddingSpace(space)
  // parse vừa build ra không bao giờ null — giữ để type chắc chắn
  if (!parsed) throw new Error('Embedding provenance: lỗi nội bộ khi dựng namespace')
  return parsed
}

/**
 * Parse chuỗi space. Trả về null khi sai format / sai version / thiếu phần —
 * caller coi null là "không tương thích", không đoán mò.
 */
export function parseEmbeddingSpace(space: string): EmbeddingProvenance | null {
  if (typeof space !== 'string') return null
  const parts = space.split(':')
  if (parts.length !== 4) return null
  const [version, provider, model, dimsRaw] = parts
  if (version !== EMBEDDING_SCHEMA_VERSION || !provider || !model) return null
  const dims = Number(dimsRaw)
  if (!Number.isInteger(dims) || dims <= 0) return null
  return { provider, model, dims, space }
}

/**
 * Hai namespace có tương thích để so dense không?
 * - null/undefined/rỗng → false (legacy vector không bao giờ "khớp" để tránh trộn).
 * - So sánh chuỗi tuyệt đối (không chuẩn hoá thêm — namespace đã chuẩn hoá lúc build).
 */
export function isSameEmbeddingSpace(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  return a === b
}

/**
 * Gate vector trước khi ghi DB: đúng số chiều + mọi phần tử là số finite.
 * Ném Error (caller ở ingest sẽ fail-closed cả tài liệu, không ghi vector hỏng).
 */
export function assertValidEmbeddingVector(
  vector: unknown,
  dims: number = EMBEDDING_DIMS,
): asserts vector is number[] {
  if (!Array.isArray(vector) || vector.length !== dims) {
    const got = Array.isArray(vector) ? vector.length : typeof vector
    throw new Error(`Embedding provenance: vector phải có đúng ${dims} chiều (nhận ${got})`)
  }
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      throw new Error(`Embedding provenance: vector[${i}] không phải số finite`)
    }
  }
}
