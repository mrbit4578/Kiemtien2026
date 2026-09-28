FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9

# ---- deps: install theo lockfile (cache layer) ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/connectors/package.json packages/connectors/
COPY packages/auth/package.json packages/auth/
COPY packages/crypto/package.json packages/crypto/
COPY packages/policy/package.json packages/policy/
RUN pnpm install --frozen-lockfile

# ---- builder: build packages/* -> prisma generate -> nest build ----
FROM deps AS builder
COPY . .
# prebuild của @orh/api chạy: build 5 packages + prisma generate
RUN pnpm --filter @orh/api build

# ---- runner: chỉ mang dist + packages đã build + node_modules ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/main.js"]
