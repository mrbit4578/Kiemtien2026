# DEPLOY.md — Đưa OpenRemoteHub lên online

Mục tiêu: web chạy online để dùng lúc rảnh, các bước nặng (ingest RAG, publish
định kỳ) tự động qua backend + worker.

## Kiến trúc deploy khuyến nghị

```
[Vercel] apps/web (Next.js)
    │  NEXT_PUBLIC_API_URL ──▶ [Railway / Render / Fly.io] apps/api (NestJS, Node 20)
    │                                │            │
    │                          [Neon/Supabase]  [Upstash]
    │                          Postgres+pgvector  Redis
    └──────────────────────────▶ (tùy chọn) apps/worker (BullMQ) — cùng host với API
```

> Vercel **không** chạy được NestJS backend hay Postgres — nên backend cần host
> Node riêng. Đừng cố deploy cả monorepo lên Vercel.

## 1. Database — Postgres có pgvector (bắt buộc)

RAG dùng cột `vector(1536)` + extension `vector`. Chọn 1:

- **Neon** (khuyến nghị): tạo project → SQL Editor chạy `CREATE EXTENSION vector;`
- **Supabase**: Database → Extensions → bật `vector`

Lấy connection string dạng `postgresql://user:pass@host:5432/dbname`.

## 2. Redis — Upstash

Tạo Upstash Redis, lấy `REDIS_URL` (dạng `rediss://...`).

## 3. Backend API — Railway / Render / Fly.io

- Root directory: repo root; build command:
  `pnpm install && pnpm --filter @orh/api build`
- Start command: `pnpm --filter @orh/api start` (chạy `node dist/main.js`)
- **Trước khi start lần đầu**, chạy migration:
  `pnpm --filter @orh/api exec prisma migrate deploy --schema prisma/schema.prisma`
  (trên Railway: dùng "one-off command"; trên Render: pre-deploy command)
- Env vars bắt buộc cho API:

| Biến | Ví dụ | Ghi chú |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Neon/Supabase |
| `REDIS_URL` | `rediss://...` | Upstash |
| `SESSION_SECRET` | chuỗi ngẫu nhiên ≥32 ký tự | sinh bằng `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex | `openssl rand -hex 32`. **Backup — mất là mất key AI đã lưu** |
| `APP_URL` | `https://app-cuaban.vercel.app` | để bật CORS cho frontend |
| `API_PORT` | `4000` | |
| `NODE_ENV` | `production` | |
| OAuth vars | `GOOGLE_CLIENT_ID`... | chỉ khi dùng OAuth social |

> Lưu ý: migration `2026092102_rag_vector` chứa kiểu `Unsupported("vector(1536)")`
> nên **dùng `prisma migrate deploy`**, không dùng `prisma migrate dev`
> (migrate diff không hỗ trợ kiểu Unsupported).

## 4. Frontend — Vercel

- Trên Vercel: New Project → import repo `mrbit4578/Kiemtien2026`
- **Root Directory:** `apps/web`
- Framework preset: Next.js (tự nhận)
- Env vars cho web:

| Biến | Ví dụ |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api-cuaban.up.railway.app` (URL public của backend, không có `/` cuối) |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |

- Deploy. Kiểm tra: mở web → `/register` tạo tài khoản → đăng nhập được
  (nghĩa là web đã nói chuyện được với API qua `NEXT_PUBLIC_API_URL`).

## 5. Worker (tùy chọn, cho publish định kỳ)

Chạy cùng host với API hoặc service riêng:
build `pnpm --filter @orh/worker build`, start `pnpm --filter @orh/worker start`,
dùng chung `DATABASE_URL`, `REDIS_URL`, `TOKEN_ENCRYPTION_KEY`.

## 6. Kiểm tra sau deploy

1. `GET https://<api>/rag/strategies` → trả JSON 5 kiến trúc (public, không cần login)
2. Đăng ký → đăng nhập trên web → vào **Cài đặt → AI Pro** thêm key Gemini/OpenAI
3. **Kho tri thức** → upload 1 file .txt → status chuyển `ready`
4. **AI Chat Pro** → bật Chế độ RAG → hỏi thử bằng strategy Hybrid
5. Kiểm tra bảng `audit_logs` trong DB có ghi `rag_ingest`, `rag_query`

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Web báo "Không kết nối được tới API" | `NEXT_PUBLIC_API_URL` sai | Sửa env trên Vercel rồi redeploy |
| API crash lúc boot: `Environment variable not found: DATABASE_URL` | thiếu env | Set `DATABASE_URL` cho service API |
| Migrate lỗi `extension "vector" does not exist` | DB không có pgvector | Dùng Neon/Supabase và bật extension `vector` |
| Ingest báo "Chưa có API key nào để tạo embedding" | chưa thêm key AI | Vào Cài đặt → AI Pro thêm key OpenAI/Gemini |
| Query RAG lỗi 502 từ provider | key sai/hết quota | Kiểm tra lại key ở Cài đặt → AI Pro |
