# Xoay key mã hóa token (TOKEN_ENCRYPTION_KEY)

Tài liệu vận hành cho việc xoay key mã hóa AES-256-GCM dùng cho OAuth token,
AI API key và WooCommerce key. Code hỗ trợ: `packages/crypto/src/envelope.ts`
(`decrypt()` tự fallback sang `TOKEN_ENCRYPTION_KEY_PREVIOUS`),
script re-encrypt: `apps/api/scripts/re-encrypt-tokens.ts`.

## ⚠️ Cảnh báo — sự cố đã từng xảy ra

Ngày 2026-09-23, key bị xoay **đột ngột** (nền tảng deploy tự sinh giá trị mới
cho `TOKEN_ENCRYPTION_KEY`): toàn bộ token đã lưu không giải mã được,
`TokenDecryptError` hàng loạt, mọi kết nối OAuth/AI key "chết" cùng lúc và chỉ
khắc phục được bằng cách yêu cầu từng user kết nối lại.

**Quy tắc sắt: KHÔNG BAO GIỜ đổi `TOKEN_ENCRYPTION_KEY` mà không qua
`TOKEN_ENCRYPTION_KEY_PREVIOUS`.** Luôn thực hiện đủ 4 bước dưới đây.

## Quy trình 4 bước an toàn

### Bước 1 — Set key cũ vào PREVIOUS (chưa đổi key chính)

```bash
TOKEN_ENCRYPTION_KEY=<key-cũ-đang-dùng>
TOKEN_ENCRYPTION_KEY_PREVIOUS=<key-cũ-đang-dùng>   # tạm thời = key hiện tại
```

Deploy. Lúc này app vẫn mã hóa/giải mã bằng key cũ — hệ thống đã "biết" về
cơ chế fallback, chưa có gì thay đổi về dữ liệu.

### Bước 2 — Đổi key chính sang key mới

Tạo key mới (32 bytes, hex):

```bash
openssl rand -hex 32
```

```bash
TOKEN_ENCRYPTION_KEY=<key-mới>
TOKEN_ENCRYPTION_KEY_PREVIOUS=<key-cũ>
```

Deploy. Từ lúc này:

- `encrypt()` **luôn dùng key mới** → token/key mới kết nối được mã hóa bằng key mới.
- `decrypt()` thử key mới trước, thất bại → tự thử key cũ → token cũ vẫn đọc
  được, không gián đoạn dịch vụ.

### Bước 3 — Chạy script re-encrypt toàn bộ DB

Chạy **dry-run trước** để ước lượng khối lượng và phát hiện bản ghi lỗi:

```bash
pnpm --filter @orh/api exec tsx scripts/re-encrypt-tokens.ts --dry-run
```

Nếu dry-run sạch (0 lỗi), chạy thật:

```bash
pnpm --filter @orh/api exec tsx scripts/re-encrypt-tokens.ts
```

Script duyệt 3 nhóm bảng và mã hóa lại từng field bằng key mới:

| Bảng (`@@map`)      | Field mã hóa                                          |
|---------------------|-------------------------------------------------------|
| `connections`       | `encryptedAccessToken`, `encryptedRefreshToken`       |
| `ai_connections`    | `keyCipher`                                           |
| `woo_stores`        | `encryptedConsumerKey`, `encryptedConsumerSecret`     |

Đặc tính an toàn của script:

- Mỗi bản ghi được `decrypt()` (tự fallback key cũ) rồi `encrypt()` lại bằng
  key mới trước khi `UPDATE` — không bao giờ ghi đè bằng dữ liệu chưa giải mã được.
- **Không ném giữa chừng**: bản ghi lỗi được gom lại, in báo cáo cuối, exit code 1.
- Chạy lại nhiều lần vẫn an toàn (idempotent): bản ghi đã sang key mới thì
  decrypt bằng key chính thành công ngay, được mã hóa lại vô hại.

### Bước 4 — Gỡ PREVIOUS

Khi script báo toàn bộ bản ghi đã dùng key mới (0 bản ghi cần fallback, 0 lỗi):

```bash
# Xóa dòng TOKEN_ENCRYPTION_KEY_PREVIOUS khỏi env
TOKEN_ENCRYPTION_KEY=<key-mới>
```

Deploy lần cuối. Hệ thống quay về 1 key duy nhất. Xong.

## Kiểm tra nhanh sau mỗi bước

```bash
# Token cũ (mã hóa bằng key cũ) vẫn đọc được trong giai đoạn xoay key:
# → không có TokenDecryptError ồ ạt trong log API/worker.
# Sau bước 4: grep log 24h, nếu còn TokenDecryptError lẻ tẻ → có bản ghi
# bị sót, chạy lại script bước 3 (khi đó phải set lại PREVIOUS tạm thời).
```

## Những gì KHÔNG được xoay

- **`HASH_PEPPER`** (hash email/IP): mọi lookup user phụ thuộc pepper hiện tại.
  Đổi pepper đột ngột = toàn bộ user không đăng nhập được và không có cơ chế
  fallback. Muốn đổi pepper phải viết migration dữ liệu riêng — hiện chưa hỗ trợ.
- **Key đang được `TOKEN_ENCRYPTION_KEY_PREVIOUS` trỏ tới** trong khi bước 3
  chưa xong.
