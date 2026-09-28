import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { AI_PROVIDER_IDS } from '../ai/dto'
import type { AiProviderId } from '../ai/ai.providers'

export const RAG_STRATEGIES = ['hybrid', 'graph', 'agentic', 'corrective', 'multimodal'] as const
export type RagStrategy = (typeof RAG_STRATEGIES)[number]

/** Metadata hiển thị cho frontend — khớp infographic "Top 5 RAG Architectures". */
export const RAG_STRATEGY_META: Array<{ id: RagStrategy; name: string; tagline: string; description: string }> = [
  {
    id: 'hybrid',
    name: 'Hybrid RAG',
    tagline: 'Vector ngữ nghĩa + từ khóa',
    description: 'Dense vectors gặp sparse keywords: tìm bằng embedding và full-text, hợp nhất bằng Reciprocal Rank Fusion.',
  },
  {
    id: 'graph',
    name: 'GraphRAG',
    tagline: 'Trả lời nằm trong quan hệ',
    description: 'Trích thực thể & quan hệ lúc nạp tài liệu, truy vấn bằng cách duyệt đồ thị 2 bước + tóm tắt cộng đồng.',
  },
  {
    id: 'agentic',
    name: 'Agentic RAG',
    tagline: 'Retrieval thành kế hoạch',
    description: 'Agent tự lập kế hoạch: gọi công cụ vector_search / keyword_search / document_stats nhiều vòng cho đến khi tự tin.',
  },
  {
    id: 'corrective',
    name: 'Corrective RAG',
    tagline: 'Chấm điểm trước khi tin',
    description: 'LLM chấm điểm từng đoạn truy hồi; mơ hồ thì viết lại câu hỏi, không có gì thì tìm web và đánh dấu ngoài tri thức.',
  },
  {
    id: 'multimodal',
    name: 'Multimodal RAG',
    tagline: 'Một index cho text, ảnh, bảng',
    description: 'Index thống nhất: text, bảng (giữ nguyên dạng bảng) và caption ảnh cùng một không gian vector.',
  },
]

/**
 * POST /rag/documents — JSON body (khi không upload file).
 * - { text, title } → nạp văn bản thuần
 * - { url, title? } → tải URL rồi trích text
 * Khi upload file multipart thì dùng field `file`, body có thể kèm `title`.
 */
export class IngestJsonDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Tiêu đề tối đa 200 ký tự.' })
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nội dung text không được rỗng.' })
  @MaxLength(200000, { message: 'Nội dung text tối đa 200.000 ký tự.' })
  text?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'URL tối đa 2000 ký tự.' })
  url?: string
}

/** POST /rag/query — hỏi AI trên kho tri thức. */
export class QueryDto {
  @IsString()
  @MinLength(2, { message: 'Câu hỏi quá ngắn.' })
  @MaxLength(2000, { message: 'Câu hỏi tối đa 2000 ký tự.' })
  query!: string

  @IsString()
  @IsIn(RAG_STRATEGIES as unknown as string[], { message: 'strategy phải là hybrid | graph | agentic | corrective | multimodal.' })
  strategy!: RagStrategy

  @IsOptional()
  @IsString()
  @IsIn(AI_PROVIDER_IDS as unknown as string[], { message: 'Provider không được hỗ trợ.' })
  provider?: AiProviderId

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number
}

export interface RagSource {
  documentId: string
  documentTitle: string
  chunkId: string
  score: number
  modality: 'text' | 'table' | 'image'
}

export interface RagStep {
  tool: string
  args: Record<string, unknown>
  result: string
}

export interface RagQueryResult {
  answer: string
  strategy: RagStrategy
  sources: RagSource[]
  steps?: RagStep[]
  outsideKnowledge?: boolean
}
