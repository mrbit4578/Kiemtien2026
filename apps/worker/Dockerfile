FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/connectors/package.json packages/connectors/
COPY packages/auth/package.json packages/auth/
COPY packages/crypto/package.json packages/crypto/
RUN pnpm install --frozen-lockfile

FROM deps AS runner
COPY . .
EXPOSE 4001
CMD ["pnpm", "--filter", "@orh/worker", "start"]
