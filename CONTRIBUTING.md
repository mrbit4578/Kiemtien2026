# Contributing to OpenRemoteHub

Cảm ơn bạn quan tâm đến dự án! Trước khi bắt đầu, vui lòng đọc:

1. [README.md](./README.md) — tổng quan và cách chạy local
2. [SECURITY.md](./SECURITY.md) — quy trình báo lỗi bảo mật
3. [docs/provider-review-checklist.md](./docs/provider-review-checklist.md) — checklist trước khi thêm connector

## Quy tắc chung

- Không commit `.env`, client secret, refresh token hay OAuth code vào Git.
- Mọi connector mới phải có `permission_manifest.ts` khai báo `provider`, `scope`, `purpose`, `data_retention_days`, `review_status`.
- Consent phải được lưu trước khi gọi API provider bất kỳ.
- Test phải cover: state, PKCE, redirect URI, token encryption, revoke.

## Pull Request

1. Fork và tạo branch: `feat/connector-linkedin`
2. Chạy `pnpm test` và `pnpm lint`
3. Mô tả rõ scope và data_retention trong PR description
4. Chờ review từ maintainer (tối đa 5 ngày làm việc)
