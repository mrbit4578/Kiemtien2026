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

## 3. Backend API — deploy 1 chạm (chọn 1 trong 2)

Repo đã có sẵn `render.yaml` (Render Blueprint) và `railway.json` (Railway):
migration DB tự chạy trước khi start, health check ở `/rag/strategies`.

### Chuẩn bị (làm 1 lần, khoảng 10 phút)

**a) Database — Neon (Postgres + pgvector)**
1. Vào neon.tech → đăng ký → **New Project** (chọn region gần nhất, ví dụ Singapore)
2. Mở **SQL Editor**, chạy: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Copy **connection string** (dạng `postgresql://...`), dùng loại kết nối Direct

**b) Redis — Upstash**
1. Vào upstash.com → tạo Redis database (region gần DB)
2. Copy **REDIS_URL** (dạng `rediss://...`)

### Cách A — Render (khuyên dùng, có free tier)

1. Render Dashboard → **New** → **Blueprint** → chọn repo `mrbit4578/Kiemtien2026`
2. Điền 2 biến: `DATABASE_URL` (Neon), `REDIS_URL` (Upstash).
   `SESSION_SECRET` và `TOKEN_ENCRYPTION_KEY` Render tự sinh ngẫu nhiên.
3. Bấm **Apply** → chờ build xong. Mở thử
   `https://<tên-service>.onrender.com/rag/strategies` — thấy JSON 5 kiến trúc là xong.

### Cách B — Railway

1. Railway → New Project → **Deploy from GitHub repo** → chọn `mrbit4578/Kiemtien2026`
2. Service tự nhận cấu hình từ `railway.json`. Vào tab **Variables**, thêm:
   - `DATABASE_URL`, `REDIS_URL` (dán từ Neon/Upstash)
   - `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`: tự sinh chuỗi ngẫu nhiên ≥32 ký tự
     (Railway có nút generate). **Backup TOKEN_ENCRYPTION_KEY — mất là mất key AI đã lưu**
   - `APP_URL` = `https://kiemtien2026-web.vercel.app`
   - `NODE_ENV` = `production`
3. Deploy → vào Settings → Networking → **Generate Domain** để lấy URL public.
   Mở thử `https://<domain>/rag/strategies`.

### Env vars đầy đủ của API

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon/Supabase (đã bật pgvector) |
| `REDIS_URL` | ✅ | Upstash |
| `SESSION_SECRET` | ✅ | chuỗi ngẫu nhiên ≥32 ký tự |
| `TOKEN_ENCRYPTION_KEY` | ✅ | ≥32 ký tự (chuỗi hex 64 ký tự vẫn tương thích ngược). **Backup — mất là mất key AI đã lưu** |
| `APP_URL` | ✅ | domain frontend Vercel — để bật CORS |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | tự động | Railway/Render tự cấp — code đã hỗ trợ |
| `SESSION_SAMESITE` | không | mặc định production = `none` (frontend Vercel và API khác domain) |
| OAuth vars | không | chỉ khi dùng OAuth social |

> `prisma migrate deploy` đã được cấu hình tự chạy trước khi start
> (preDeployCommand trong render.yaml / startCommand trong railway.json).
> Không dùng `prisma migrate dev` trên production.

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

> ⚠️ **Sau khi sửa/thêm `NEXT_PUBLIC_API_URL` bắt buộc phải Redeploy**
> (Vercel → Deployments → `⋯` → Redeploy), vì biến `NEXT_PUBLIC_*` được nhúng
> vào code lúc build. Không redeploy thì web vẫn gọi URL cũ.

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
