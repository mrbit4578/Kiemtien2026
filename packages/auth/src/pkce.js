"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePkce = generatePkce;
exports.buildOAuthUrl = buildOAuthUrl;
const crypto_1 = require("crypto");
/**
 * Tạo PKCE code_verifier và code_challenge.
 * Spec: https://www.rfc-editor.org/rfc/rfc7636
 */
function generatePkce() {
    // code_verifier: 43–128 ký tự URL-safe
    const codeVerifier = (0, crypto_1.randomBytes)(48).toString('base64url');
    // code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
    const codeChallenge = (0, crypto_1.createHash)('sha256')
        .update(codeVerifier)
        .digest('base64url');
    return { codeVerifier, codeChallenge };
}
function buildOAuthUrl(authorizationEndpoint, params) {
    const url = new URL(authorizationEndpoint);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scopes.join(' '));
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (params.extra) {
        for (const [k, v] of Object.entries(params.extra)) {
            url.searchParams.set(k, v);
        }
    }
    return url.toString();
}
//# sourceMappingURL=pkce.js.map