export type ErrorCode = 'TOKEN_EXPIRED' | 'RATE_LIMITED' | 'PERMISSION_DENIED' | 'PROVIDER_REVIEW_REQUIRED' | 'CONTENT_REJECTED' | 'TRANSIENT_NETWORK_ERROR' | 'PROVIDER_REAUTH_REQUIRED' | 'DUPLICATE_JOB' | 'CONSENT_REQUIRED' | 'WORKSPACE_NOT_FOUND' | 'CONNECTION_NOT_FOUND' | 'INVALID_STATE' | 'INVALID_REDIRECT_URI';
export interface ApiError {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    provider?: string;
    actionUrl?: string | null;
}
export declare class OrhError extends Error {
    readonly code: ErrorCode;
    readonly retryable: boolean;
    readonly provider?: string;
    constructor(code: ErrorCode, message: string, retryable?: boolean, provider?: string);
    toApiResponse(): ApiError;
}
