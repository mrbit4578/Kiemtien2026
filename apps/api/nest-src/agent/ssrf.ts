/**
 * Giữ tương thích ngược: toàn bộ logic SSRF/safe-fetch đã chuyển sang
 * `../common/safe-fetch` để module RAG và các nơi khác dùng chung.
 */
export * from '../common/safe-fetch'
