# Provider Review Checklist

Sử dụng checklist này trước khi merge một connector mới.

## 1. Permission Manifest
- [ ] Có file `permission_manifest.ts` với đầy đủ `provider`, `scope`, `purpose`, `data_retention_days`, `review_status`
- [ ] `review_status` là một trong: `approved` | `pending_review` | `not_supported`
- [ ] Scope khai báo là **scope hẹp nhất** đủ cho tính năng

## 2. OAuth Flow
- [ ] Dùng Authorization Code + PKCE
- [ ] `state` ngẫu nhiên, TTL ≤ 10 phút
- [ ] Redirect URI theo allowlist, không lấy từ query param
- [ ] Không log `code`, `code_verifier`, token

## 3. Token
- [ ] Access token mã hóa trước khi lưu
- [ ] Refresh token mã hóa, có rotation
- [ ] Có hàm `revoke()` hoạt động

## 4. Rate limit & Error
- [ ] Xử lý `RATE_LIMITED` với exponential backoff
- [ ] Xử lý `TOKEN_EXPIRED` bằng refresh
- [ ] Xử lý `PERMISSION_DENIED` bằng reauth prompt
- [ ] Xử lý `PROVIDER_REVIEW_REQUIRED` bằng status `not_supported`

## 5. UI
- [ ] Hiển thị scope đang cấp trước khi kết nối
- [ ] Hiển thị nút revoke rõ ràng
- [ ] Nếu tính năng chưa được review → hiển thị "Chưa hỗ trợ" / "Cần review"

## 6. Test
- [ ] Test: authorization URL đúng format
- [ ] Test: exchangeCode trả về TokenSet hợp lệ (mock)
- [ ] Test: revoke gọi đúng endpoint
- [ ] Test: getIdentity parse profile đúng

## 7. Docs
- [ ] Cập nhật `docs/privacy-data-map.md`
- [ ] Cập nhật bảng Provider trong README
