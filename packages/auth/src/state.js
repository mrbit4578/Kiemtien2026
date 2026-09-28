"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOAuthState = createOAuthState;
exports.validateOAuthState = validateOAuthState;
exports.validateRedirectUri = validateRedirectUri;
const crypto_1 = require("crypto");
const TTL_MS = 10 * 60 * 1000; // 10 phút
/**
 * Tạo state ngẫu nhiên 1 lần, có TTL ngắn.
 * KHÔNG log state hay codeVerifier.
 */
function createOAuthState(input) {
    return {
        ...input,
        value: (0, crypto_1.randomBytes)(32).toString('hex'),
        expiresAt: Date.now() + TTL_MS,
    };
}
function validateOAuthState(stored, received) {
    if (stored.value !== received) {
        throw new Error('Invalid state: CSRF detected.');
    }
    if (Date.now() > stored.expiresAt) {
        throw new Error('State expired.');
    }
}
/**
 * Kiểm tra redirect URI có nằm trong allowlist không.
 * Không bao giờ lấy redirect URI từ query parameter.
 */
function validateRedirectUri(uri, allowlist) {
    if (!allowlist.includes(uri)) {
        throw new Error(`Invalid redirect URI: ${uri}`);
    }
}
//# sourceMappingURL=state.js.map