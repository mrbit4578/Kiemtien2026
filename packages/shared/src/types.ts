// ─── Core Domain Types ───────────────────────────────────────────────────────

export type Provider = 'google' | 'facebook' | 'instagram' | 'tiktok' | 'github' | 'canva'

export type ReviewStatus = 'approved' | 'pending_review' | 'not_supported'

export type ConnectionStatus = 'active' | 'reauth_required' | 'revoked' | 'error'

export type ContentStatus = 'draft' | 'pending_approval' | 'approved' | 'published' | 'failed'

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead_letter'

export type Plan = 'free' | 'pro' | 'team'

// ─── OAuth ────────────────────────────────────────────────────────────────────

export interface OAuthStartInput {
  workspaceId: string
  redirectUri: string
  scopes?: string[]
  state: string
}

export interface OAuthCallbackInput {
  code: string
  state: string
  redirectUri: string
  codeVerifier: string
}

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt: Date
  scopes: string[]
  tokenType: string
}

export interface ProviderIdentity {
  providerUserId: string
  displayName: string
  email?: string
  profileUrl?: string
}

// ─── Permission Manifest ──────────────────────────────────────────────────────

export interface PermissionManifest {
  provider: Provider
  scopes: ScopeEntry[]
  reviewStatus: ReviewStatus
  requiredForMvp: boolean
  notes?: string
}

export interface ScopeEntry {
  scope: string
  purpose: string
  dataRetentionDays: number
  sensitivityLevel: 'basic' | 'sensitive' | 'restricted'
}

// ─── Connector Interface ──────────────────────────────────────────────────────

export interface Connection {
  id: string
  workspaceId: string
  provider: Provider
  providerUserId: string
  encryptedAccessToken: string
  encryptedRefreshToken?: string
  expiresAt: Date
  scopesJson: string[]
  status: ConnectionStatus
  lastError?: string
  createdAt: Date
}

export interface PublishInput {
  connection: Connection
  caption: string
  mediaUrls: string[]
  scheduledAt?: Date
  /**
   * Loại media đã được probe trước (song song với mediaUrls).
   * Worker điền sau khi kiểm tra content-type của từng URL; connector dùng để
   * chọn đúng tham số Instagram (image_url vs video_url + REELS). Không có thì
   * connector tự đoán theo đuôi file.
   */
  mediaKinds?: MediaKind[]
}

/** Loại media cho publish: ảnh hoặc video. */
export type MediaKind = 'image' | 'video'

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm'])

/**
 * Đoán loại media theo đuôi file trong URL (bỏ query string và fragment).
 * Không chắc chắn 100% — worker nên probe content-type thật qua probeMediaUrl;
 * đây chỉ là fallback nhanh phía connector.
 */
export function detectMediaKind(url: string): MediaKind {
  const clean = url.split('?')[0].split('#')[0]
  const ext = clean.slice(clean.lastIndexOf('.') + 1).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image'
}

export interface PublishResult {
  platformPostId: string
  url?: string
  status: 'published' | 'pending' | 'private'
  warning?: string
}
