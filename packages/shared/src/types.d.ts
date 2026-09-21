export type Provider = 'google' | 'facebook' | 'instagram' | 'tiktok' | 'github';
export type ReviewStatus = 'approved' | 'pending_review' | 'not_supported';
export type ConnectionStatus = 'active' | 'reauth_required' | 'revoked' | 'error';
export type ContentStatus = 'draft' | 'pending_approval' | 'approved' | 'published' | 'failed';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead_letter';
export type Plan = 'free' | 'pro' | 'team';
export interface OAuthStartInput {
    workspaceId: string;
    redirectUri: string;
    scopes?: string[];
    state: string;
}
export interface OAuthCallbackInput {
    code: string;
    state: string;
    redirectUri: string;
    codeVerifier: string;
}
export interface TokenSet {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    scopes: string[];
    tokenType: string;
}
export interface ProviderIdentity {
    providerUserId: string;
    displayName: string;
    email?: string;
    profileUrl?: string;
}
export interface PermissionManifest {
    provider: Provider;
    scopes: ScopeEntry[];
    reviewStatus: ReviewStatus;
    requiredForMvp: boolean;
    notes?: string;
}
export interface ScopeEntry {
    scope: string;
    purpose: string;
    dataRetentionDays: number;
    sensitivityLevel: 'basic' | 'sensitive' | 'restricted';
}
export interface Connection {
    id: string;
    workspaceId: string;
    provider: Provider;
    providerUserId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    expiresAt: Date;
    scopesJson: string[];
    status: ConnectionStatus;
    lastError?: string;
    createdAt: Date;
}
export interface PublishInput {
    connection: Connection;
    caption: string;
    mediaUrls: string[];
    scheduledAt?: Date;
}
export interface PublishResult {
    platformPostId: string;
    url?: string;
    status: 'published' | 'pending' | 'private';
    warning?: string;
}
