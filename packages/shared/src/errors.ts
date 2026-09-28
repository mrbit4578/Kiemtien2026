// ─── Error Codes ──────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMITED'
  | 'PERMISSION_DENIED'
  | 'PROVIDER_REVIEW_REQUIRED'
  | 'CONTENT_REJECTED'
  | 'TRANSIENT_NETWORK_ERROR'
  | 'PROVIDER_REAUTH_REQUIRED'
  | 'DUPLICATE_JOB'
  | 'CONSENT_REQUIRED'
  | 'WORKSPACE_NOT_FOUND'
  | 'CONNECTION_NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_REDIRECT_URI'

export interface ApiError {
  code: ErrorCode
  message: string
  retryable: boolean
  provider?: string
  actionUrl?: string | null
}

export class OrhError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly provider?: string,
  ) {
    super(message)
    this.name = 'OrhError'
  }

  toApiResponse(): ApiError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      provider: this.provider,
      actionUrl: null,
    }
  }
}

// Usage examples:
// throw new OrhError('TOKEN_EXPIRED', 'Access token đã hết hạn.', true, 'google')
// throw new OrhError('PROVIDER_REVIEW_REQUIRED', 'Tính năng cần app review.', false, 'tiktok')
