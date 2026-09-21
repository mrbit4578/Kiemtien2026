export interface OAuthState {
    value: string;
    workspaceId: string;
    provider: string;
    codeVerifier: string;
    redirectUri: string;
    expiresAt: number;
}
/**
 * Tạo state ngẫu nhiên 1 lần, có TTL ngắn.
 * KHÔNG log state hay codeVerifier.
 */
export declare function createOAuthState(input: Omit<OAuthState, 'value' | 'expiresAt'>): OAuthState;
export declare function validateOAuthState(stored: OAuthState, received: string): void;
/**
 * Kiểm tra redirect URI có nằm trong allowlist không.
 * Không bao giờ lấy redirect URI từ query parameter.
 */
export declare function validateRedirectUri(uri: string, allowlist: string[]): void;
