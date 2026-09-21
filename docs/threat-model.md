# Threat Model — OpenRemoteHub

## Tài sản cần bảo vệ

| Tài sản | Mức độ nhạy cảm | Biện pháp |
|---------|----------------|----------|
| Refresh token | Rất cao | Mã hóa envelope (KMS), rotation, revoke khi disconnect |
| Access token | Cao | Mã hóa, không log, TTL ngắn |
| Email hash / profile | Trung bình | Không lưu email đầy đủ nếu chỉ cần identity |
| Nội dung creator | Trung bình | Tenant isolation, ACL, signed URL |
| Audit log | Cao | Immutable append-only, không chứa secret |

## Threat Actors

1. **External attacker** — khai thác OAuth callback, CSRF, SSRF
2. **Insider** — admin đọc token plaintext
3. **Provider** — rate limit, permission revoke đột ngột
4. **Abuse user** — spam, fake campaign, scraping qua API của chúng ta

## Attack Scenarios

### A1 — CSRF OAuth callback
- **Vector**: Attacker gửi URL callback với code của victim
- **Biện pháp**: `state` ngẫu nhiên 1 lần, TTL ngắn, bind với session

### A2 — Token leakage qua log
- **Vector**: Refresh token xuất hiện trong application log
- **Biện pháp**: Không log Authorization header, code, refresh token; secret scanning CI

### A3 — IDOR (Insecure Direct Object Reference)
- **Vector**: User A truy cập connection của User B bằng cách đoán ID
- **Biện pháp**: Mọi query có `workspace_id` trong WHERE; Row-Level Security

### A4 — Duplicate publish
- **Vector**: Retry job publish trùng nội dung
- **Biện pháp**: Idempotency key trên mỗi job; dead-letter queue sau N retry

### A5 — Abuse & spam
- **Vector**: User dùng API để spam qua platform
- **Biện pháp**: Quota per workspace, moderation queue, kill switch per connector

## Checklist bảo mật (trước khi public production)

- [ ] HTTPS bắt buộc, HSTS enabled
- [ ] `state` ngẫu nhiên, 1 lần, TTL ≤ 10 phút, bind session
- [ ] `code_verifier` không xuất hiện trong log
- [ ] Redirect URI theo allowlist tuyệt đối
- [ ] Token mã hóa bằng KMS; key rotation định kỳ
- [ ] Không log Authorization header, code, refresh token
- [ ] Refresh token rotation + revoke khi disconnect
- [ ] Rate limit: callback, login, publish, webhook
- [ ] Audit log không chứa secret
- [ ] Pentest: CSRF, SSRF, IDOR, XSS, SQL injection, replay, token leakage
- [ ] Quy trình xóa dữ liệu và xử lý yêu cầu privacy
