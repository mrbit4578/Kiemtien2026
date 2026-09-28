"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = require("crypto");
/**
 * Envelope encryption cho token.
 * Production: thay getKey() bằng KMS (AWS KMS, GCP KMS, Vault).
 *
 * Format: iv(12 bytes) + authTag(16 bytes) + ciphertext
 */
const ALGORITHM = 'aes-256-gcm';
function getKey() {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex || hex.length < 64) {
        throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 chars).');
    }
    return Buffer.from(hex, 'hex');
}
function encrypt(plaintext) {
    const key = getKey();
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Kết hợp: iv | authTag | ciphertext → base64
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}
function decrypt(ciphertext) {
    const key = getKey();
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
// KHÔNG export raw key. Không log plaintext token.
//# sourceMappingURL=envelope.js.map