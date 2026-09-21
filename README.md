# OpenRemoteHub

**Nền tảng kiếm tiền online minh bạch và an toàn — mã nguồn mở**

OpenRemoteHub giúp người dùng quản lý công việc online lúc rảnh: kết nối tài khoản qua OAuth, lên lịch nội dung, theo dõi chiến dịch, quản lý cơ hội affiliate/freelance và xem báo cáo. Dự án **không** hứa hẹn thu nhập, **không** bán tương tác ảo, **không** thu thập mật khẩu và **không** tự động spam.

## Kiến trúc

```
[Web: Next.js]
    |
[API: NestJS]  ─────  [PostgreSQL]
    |
    +── [OAuth Connector Layer]  (Google, Meta, Instagram, TikTok, GitHub)
    +── [Queue: Redis + Worker]
    +── [Object Storage]
    +── [Audit Log]
```

## Cấu trúc monorepo

```
openremotehub/
  apps/
    web/        # Next.js 14 dashboard
    api/        # NestJS REST API + OAuth callbacks
    worker/     # BullMQ queue jobs & webhooks
  packages/
    connectors/ # google, meta, instagram, tiktok
    auth/       # PKCE, state, session helpers
    crypto/     # Envelope encryption
    shared/     # Types, error codes
    policy/     # Consent & retention rules
  infra/
    docker/
    terraform/
  docs/
    threat-model.md
    privacy-data-map.md
    provider-review-checklist.md
```

## Bắt đầu nhanh

```bash
# 1. Clone
git clone https://github.com/your-org/openremotehub.git
cd openremotehub

# 2. Copy env
cp .env.example .env
# Điền các giá trị OAuth credentials vào .env

# 3. Chạy với Docker
docker compose up -d

# 4. Migrate database
pnpm --filter api db:migrate

# 5. Mở http://localhost:3000
```

## Chạy local chi tiết (không Docker)

```bash
# 1. Cài deps
pnpm install

# 2. Chuẩn bị Postgres có pgvector + Redis
#    Cách nhanh: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=orh_password \
#      --name orh-pg pgvector/pgvector:pg16
#    (tạo DB openremotehub, user orh — khớp DATABASE_URL trong .env.example)

# 3. Copy env và điền secret thật
cp .env.example .env
# BẮT BUỘC đổi: SESSION_SECRET, TOKEN_ENCRYPTION_KEY (32-byte hex)

# 4. Migrate database (tạo bảng + extension vector)
pnpm --filter @orh/api exec prisma migrate deploy --schema prisma/schema.prisma

# 5. Chạy API + Web (2 terminal)
pnpm --filter @orh/api dev    # http://localhost:4000
pnpm --filter @orh/web dev    # http://localhost:3000
```

## AI Pro & RAG — Kho tri thức

1. Đăng ký/đăng nhập ở `/register`.
2. Vào **Cài đặt → AI Pro** (`/settings/ai`), thêm API key của gói bạn đã mua
   (Gemini / ChatGPT / Grok / Claude / DeepSeek). Key được kiểm tra thật với
   hãng rồi mã hóa AES-256-GCM trước khi lưu — không bao giờ lộ ra frontend.
3. Vào **Kho tri thức** (`/knowledge`): upload file (.txt/.md/.pdf/.png/.jpg/.csv),
   dán URL hoặc text. Hệ thống tự chunk (~800 ký tự), tạo embedding
   (ưu tiên OpenAI `text-embedding-3-small`; chỉ có Gemini key thì dùng
   `text-embedding-004` zero-pad lên 1536 chiều) và trích knowledge graph.
4. Vào **AI Chat Pro** (`/ai-chat`), bật **Chế độ RAG**, chọn 1 trong 5 kiến trúc:
   Hybrid, GraphRAG, Agentic, Corrective, Multimodal — rồi hỏi trên tài liệu của bạn.

Chi tiết deploy production: xem [DEPLOY.md](./DEPLOY.md).

## MVP Roadmap

| Mốc | Phạm vi | Tiêu chí hoàn thành |
|-----|---------|--------------------|
| M0 – Foundation | Monorepo, Docker, Postgres, auth nội bộ | CI xanh, migration, secret management |
| M1 – Identity | Google Sign-In và session | OAuth callback có state/PKCE, revoke hoạt động |
| M2 – Connectors | Facebook, Instagram professional, TikTok Login Kit | Consent, scope manifest, error mapping |
| M3 – Workspace | Content calendar, asset upload, approval | Không publish nếu chưa approve |
| M4 – Publishing | Instagram/TikTok khi app đủ review | Queue, idempotency, retry, audit log |
| M5 – Monetization | Free/Pro/Team, billing webhook | Không để billing webhook tự sửa plan |
| M6 – Hardening | Threat model, backup restore, pentest | Incident runbook, deletion test |

## Giấy phép

Licensed under **AGPLv3** — xem [LICENSE](./LICENSE).

## Disclaimer

Dự án chỉ cung cấp công cụ. Người dùng tự chịu trách nhiệm về nội dung, quyền sử dụng media, disclosure affiliate, thuế, luật nội địa và việc tuân thủ Terms of Service của từng nền tảng. Không có bất kỳ mức thu nhập nào được đảm bảo.
