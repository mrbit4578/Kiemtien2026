/**
 * Kiểu dữ liệu trả về từ backend NestJS (khớp Prisma schema + controllers).
 * Không bịa field: chỉ khai báo những gì backend thực sự trả về.
 */

export type ApiProvider = 'google' | 'facebook' | 'instagram' | 'tiktok' | 'github'

export type ApiConnectionStatus = 'active' | 'reauth_required' | 'revoked' | 'error'

/** GET /connections — backend KHÔNG bao giờ trả token (kể cả đã mã hóa) */
export interface ApiConnection {
  id: string
  provider: ApiProvider
  providerUserId: string
  status: ApiConnectionStatus
  scopesJson: string[]
  expiresAt: string
  lastError?: string | null
  createdAt: string
}

/** GET /content — khớp model ContentItem trong Prisma */
export interface ApiContentItem {
  id: string
  workspaceId: string
  caption: string
  assetUrl: string | null
  scheduledAt: string | null
  /** draft | approved | published | failed (backend không dùng pending_approval cho status) */
  status: string
  /** pending | approved | rejected */
  approvalStatus: string
  createdAt: string
}

/** GET /analytics/overview */
export interface AnalyticsOverview {
  totalConnections: number
  totalPublished: number
  totalFailed: number
  lastUpdated: string
}

/** POST /content/:id/publish — trả về khi tạo job thành công */
export interface PublishQueued {
  id: string
  queued: boolean
  jobId: string
}

/* ─── AI Pro ─────────────────────────────────────────────────────────────── */

/** GET /ai/providers — metadata public, không secret */
export interface AiProviderMeta {
  id: string
  name: string
  keyUrl: string
  models: string[]
  defaultModel: string
  description: string
}

/** GET /ai/connections — backend KHÔNG bao giờ trả key (kể cả đã mã hóa) */
export interface AiConnectionInfo {
  provider: string
  status: 'active' | 'invalid'
  /** 4 ký tự cuối của key, dạng ••••1234 */
  keyHint: string
  validatedAt: string | null
  lastUsedAt: string | null
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Metadata RAG khi message được tạo ở chế độ RAG (không có ở chat thường) */
  ragMeta?: RagQueryResult
  /** Metadata agent khi message được tạo ở chế độ Agent (không có ở chat thường) */
  agentMeta?: AgentRunResponse
}

/* ─── AI Agent (gọi tools) ───────────────────────────────────────────── */

/** Một tool call trong trace của agent run. */
export interface AgentToolCall {
  name: string
  ok: boolean
  ms: number
  truncated: boolean
  output: string
}

/** POST /ai/agent/run */
export interface AgentRunResponse {
  content: string
  model: string
  provider: string
  turns: number
  stoppedReason: string
  toolCalls: AgentToolCall[]
}

/* ─── RAG / Kho tri thức ───────────────────────────────────────────── */

/** 5 kiến trúc RAG: GET /rag/documents, POST /rag/documents, POST /rag/query */
export type RagStrategy = 'hybrid' | 'graph' | 'agentic' | 'corrective' | 'multimodal'

export type RagSourceType = 'file' | 'url' | 'text'

export type RagDocStatus = 'processing' | 'ready' | 'failed'

export type RagModality = 'text' | 'table' | 'image'

/** GET /rag/documents */
export interface RagDocument {
  id: string
  title: string
  sourceType: RagSourceType
  sourceUrl?: string | null
  mimeType?: string | null
  status: RagDocStatus
  chunkCount: number
  error?: string | null
  createdAt: string
}

export interface RagSource {
  documentId: string
  documentTitle: string
  chunkId: string
  score: number
  modality: RagModality
}

export interface RagStep {
  tool: string
  args: unknown
  result: string
}

/** POST /rag/query */
export interface RagQueryResult {
  answer: string
  strategy: RagStrategy
  sources: RagSource[]
  steps?: RagStep[]
  outsideKnowledge?: boolean
}

export interface RagQueryBody {
  query: string
  strategy: RagStrategy
  provider?: string
  model?: string
  topK?: number
}

/** POST /ai/chat */
export interface ChatResponse {
  content: string
  model: string
  usage: Record<string, unknown> | null
  provider: string
}
