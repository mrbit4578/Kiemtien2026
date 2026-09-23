# Kiemtien2026 API + Concat video renderer — single sidecar image.
#
# Mô hình: 1 image duy nhất chứa cả Node API + concat-cli binary + ffmpeg.
# API tự spawn `concat-cli serve` local (CONCAT_AUTOSTART=true) và điều khiển
# qua JSON-RPC — media.import nhận filesystem path, MP4 output nằm trên disk
# của chính container này, nên KHÔNG tách renderer ra service riêng.
#
# Binary cần GLIBC_2.38+ (build trên Ubuntu 24.04 / Debian 12) → mọi stage đều
# dùng bookworm (Debian 12), KHÔNG dùng alpine (musl).

# ─── Stage 1: build concat-cli từ vendored source ──────────────────────────
FROM rust:1.93-bookworm AS rust-builder
# Nếu tag 1.93 chưa có trên Docker Hub lúc build, đổi thành rust:bookworm.
WORKDIR /opt/concat-src

# FFmpeg dev headers cho ffmpeg-sys (build.rs yêu cầu libavcodec >= 59.37;
# bookworm có FFmpeg 5.1 = 59.37.100, vừa đủ) + libclang cho bindgen.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libavcodec-dev libavformat-dev libavutil-dev libavfilter-dev \
    libavdevice-dev libswscale-dev libswresample-dev libpostproc-dev \
    clang libclang-dev pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Vendored snapshot (đã loại target/): build deterministic, không fetch git.
COPY docker/concat-src/ ./
RUN cargo build --release -p concat-cli \
    && ls -lh target/release/concat-cli \
    && target/release/concat-cli --version

# ─── Stage 2: install + build Node workspace ───────────────────────────────
FROM node:20-bookworm AS node-builder
WORKDIR /app
RUN corepack enable

# Copy toàn bộ repo (đã trừ những gì .dockerignore loại: node_modules, dist,
# target, .git, .env...). Lưu ý: .dockerignore PHẢI giữ lại docker/concat-src
# vì stage rust-builder COPY nó từ build context.
COPY . ./

# NODE_ENV=development để pnpm cài đủ devDependencies (typescript, @types,
# prisma CLI...) phục vụ build; lúc chạy thật NODE_ENV=production.
RUN NODE_ENV=development pnpm install --frozen-lockfile \
    && pnpm --filter @orh/api build
# prebuild của @orh/api tự chạy: build 5 packages/* + prisma generate,
# rồi tsc -p tsconfig.nest.json → apps/api/dist.

# ─── Stage 3: runtime ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production \
    CONCAT_CLI_PATH=/usr/local/bin/concat-cli

# ffmpeg: binary ffprobe/ffmpeg + toàn bộ libav* runtime mà concat-cli link
# tới (libavcodec59, libavformat59, libavutil57, libavfilter8, libavdevice59,
# libswscale6...). pnpm global: preDeployCommand chạy migrate-with-retry.sh,
# script này gọi `pnpm exec prisma`.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@9.0.0

# Toàn bộ workspace đã build: node_modules, apps/api/dist, packages/*/dist,
# apps/api/prisma (schema + migrations cho preDeploy), scripts.
COPY --from=node-builder /app /app
# concat-cli binary từ stage Rust.
COPY --from=rust-builder /opt/concat-src/target/release/concat-cli /usr/local/bin/concat-cli
RUN chmod +x /usr/local/bin/concat-cli \
    && concat-cli --version \
    && if ldd /usr/local/bin/concat-cli | grep -qi "not found"; then \
         echo "MISSING SHARED LIBS for concat-cli:"; \
         ldd /usr/local/bin/concat-cli | grep -i "not found"; \
         exit 1; \
       fi \
    && echo "concat-cli: all shared libs resolved"

# Render tự inject PORT; main.ts đọc process.env.PORT (fallback 4000).
EXPOSE 4000
CMD ["node", "dist/main.js"]
