"use strict";
// ─── Error Codes ──────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrhError = void 0;
class OrhError extends Error {
    constructor(code, message, retryable = false, provider) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.provider = provider;
        this.name = 'OrhError';
    }
    toApiResponse() {
        return {
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            provider: this.provider,
            actionUrl: null,
        };
    }
}
exports.OrhError = OrhError;
// Usage examples:
// throw new OrhError('TOKEN_EXPIRED', 'Access token đã hết hạn.', true, 'google')
// throw new OrhError('PROVIDER_REVIEW_REQUIRED', 'Tính năng cần app review.', false, 'tiktok')
//# sourceMappingURL=errors.js.map