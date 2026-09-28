/**
 * Tạo PKCE code_verifier và code_challenge.
 * Spec: https://www.rfc-editor.org/rfc/rfc7636
 */
export declare function generatePkce(): {
    codeVerifier: string;
    codeChallenge: string;
};
export declare function buildOAuthUrl(authorizationEndpoint: string, params: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
    state: string;
    codeChallenge: string;
    extra?: Record<string, string>;
}): string;
