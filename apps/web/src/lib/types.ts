/**
 * Kiểu dữ liệu trả về từ backend NestJS (khớp Prisma schema + controllers).
 * Không bịa field: chỉ khai báo những gì backend thực sự trả về.
 */

export type ApiProvider = 'google' | 'facebook' | 'instagram' | 'tiktok' | 'github' | 'canva'

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
export interface ApiContentJob {
  id: string
  status: string
  lastError: string | null
  connectionId: string
  nextRunAt: string | null
}

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
  /** job publish mới nhất (nếu có) — để hiện lỗi */
  jobs?: ApiContentJob[]
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
  /** Khi server tự chuyển provider dự phòng (combo key) */
  fallback?: { from: string; to: string; reason?: string }
  /** Id tin nhắn trong DB khi đã lưu vào nhật ký — dùng để xóa từng tin nhắn */
  historyId?: string
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
  /** Có mặt khi server tự chuyển sang provider dự phòng (combo key) */
  fallback?: { from: string; to: string }
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
  /** Có mặt khi server tự chuyển sang provider dự phòng (combo key) */
  fallback?: { from: string; to: string; reason: string }
}

/* ─── Nhật ký chat AI Pro ─────────────────────────────────────────────── */

export type ChatHistoryMode = 'chat' | 'agent' | 'rag'

export interface ChatHistoryMeta {
  provider?: string
  model?: string
  fallback?: { from: string; to: string; reason?: string }
  ragMeta?: RagQueryResult
  agentMeta?: AgentRunResponse
}

export interface ChatSession {
  id: string
  provider: string
  providerName: string
  model: string | null
  mode: ChatHistoryMode
  title: string
  messageCount: number
  preview: string
  createdAt: string
  updatedAt: string
}

export interface ChatHistoryMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  meta?: ChatHistoryMeta
  createdAt: string
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatHistoryMessage[]
}

/* ─── Video Faceless ───────────────────────────────────────────── */

export const VIDEO_STAGES = [
  'intake',
  'analysis',
  'angle',
  'research',
  'script',
  'assets',
  'voice',
  'edit',
  'qa',
  'publish',
] as const

export const VIDEO_STAGE_LABELS: Record<string, string> = {
  intake: 'Tiếp nhận',
  analysis: 'Phân tích nguồn',
  angle: 'Chọn góc',
  research: 'Nghiên cứu',
  script: 'Kịch bản',
  assets: 'Tài sản',
  voice: 'Giọng đọc',
  edit: 'Dựng',
  qa: 'Kiểm duyệt QA',
  publish: 'Xuất bản & học',
}

export const GATE_LABELS: Record<string, string> = {
  G1: 'Source — đã lưu URL, owner, bản phân tích',
  G2: 'Rights — mọi asset commercial-use đã cleared',
  G3: 'Originality — qua G0, có giá trị độc lập khi bỏ nguồn',
  G4: 'Accuracy — claim critical có nguồn, wording đúng',
  G5: 'AI/privacy — consent, label, không impersonation',
  G6: 'Platform — đạt rule từng nền tảng mục tiêu',
  G7: 'Commercial — sponsor/affiliate đã disclose',
  G8: 'Accessibility — subtitle đúng, đọc được trên mobile',
}

export interface VideoProjectSummary {
  id: string
  title: string
  series: string | null
  stage: string
  riskScore: number | null
  assetCount: number
  claimCount: number
  aiEntryCount: number
  contentItemId: string | null
  createdAt: string
  updatedAt: string
}

export interface VideoAsset {
  id: string
  projectId: string
  name: string
  assetType: string
  sourceUrl: string | null
  owner: string | null
  rightsBasis: string
  scope: string | null
  proof: string | null
  status: 'cleared' | 'conditional' | 'pending' | 'reject'
  createdAt: string
}

export interface VideoClaim {
  id: string
  projectId: string
  claimText: string
  claimType: string
  riskLevel: string
  primarySource: string | null
  secondarySource: string | null
  confidence: string
  status: 'open' | 'corrected' | 'withdrawn'
  createdAt: string
}

export interface VideoAiEntry {
  id: string
  projectId: string
  assetName: string
  tool: string
  inputSource: string | null
  outputUse: string | null
  category: 'A0' | 'A1' | 'A2' | 'A3' | 'A4'
  realPerson: boolean
  labelRequired: boolean
  labelApplied: boolean
  consentStatus: string | null
  createdAt: string
}

export interface VideoProjectDetail extends VideoProjectSummary {
  viralSourceUrl: string | null
  sourceNote: string | null
  angle: string | null
  briefJson: string | null
  script: string | null
  caption: string | null
  publishNotes: string | null
  riskBreakdown: string | null
  gatesJson: string | null
  assets: VideoAsset[]
  claims: VideoClaim[]
  aiEntries: VideoAiEntry[]
}

export interface RiskResult {
  score: number
  breakdown: { c: number; p: number; l: number; a: number; m: number; h: number }
  decision: string
  veto: string | null
}

export interface GateState {
  pass: boolean
  note?: string
}

export interface PublishReadiness {
  ready: boolean
  blockingAssets: Array<{ id: string; name: string; status: string }>
  riskyClaims: Array<{ id: string; claimText: string }>
}
