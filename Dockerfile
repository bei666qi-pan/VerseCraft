# syntax=docker/dockerfile:1.4
# Coolify / 通用生产镜像：多阶段 + standalone；需 Docker BuildKit（Coolify 默认开启）。
#
# 可选 Build Args（在 Coolify「Build Arguments」中设置）：
# - DOCKER_IMAGE_BASE：默认 node:20-alpine（国际节点）；国内可换华为等镜像加速拉取
# - PNPM_REGISTRY：留空=官方 registry.npmjs.org；国内可填 https://registry.npmmirror.com
#
# syntax 行启用 RUN --mount=type=cache，加速重复构建时的 pnpm 缓存命中。

ARG DOCKER_IMAGE_BASE=node:20-alpine
FROM ${DOCKER_IMAGE_BASE} AS base
RUN apk add --no-cache ca-certificates libc6-compat

# ---- 第一阶段：安装依赖（pnpm store 缓存挂载，重复构建更快）----
FROM base AS deps
WORKDIR /app

ARG PNPM_REGISTRY=
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
RUN pnpm config set fetch-retries 5
RUN pnpm config set fetch-retry-mintimeout 20000
RUN pnpm config set fetch-retry-maxtimeout 120000
RUN if [ -n "$PNPM_REGISTRY" ]; then pnpm config set registry "$PNPM_REGISTRY"; fi

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- 第二阶段：编译打包 ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# 降低小内存 Coolify 构建机上 next build OOM 概率（可按机器调大/调小）
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
RUN pnpm run build

# ---- 第三阶段：运行镜像 ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV MIGRATE_ON_BOOT=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.js ./scripts/migrate.js

USER nextjs
EXPOSE 3000
# start-period：给 migrate + Node 监听留足时间，减少 Coolify 首次健康检查误杀
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "if [ \"${MIGRATE_ON_BOOT}\" = \"1\" ]; then node scripts/migrate.js; fi; node server.js"]
