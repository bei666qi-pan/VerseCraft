# Coolify / 通用生产镜像：多阶段 + standalone。
#
# 故意不使用 `# syntax=docker/dockerfile:1.x`：该指令会让构建机从 Docker Hub 拉取
# `docker/dockerfile` 前端镜像；在无法访问 registry-1.docker.io 的网络下会超时失败。
# 亦不使用 `RUN --mount=type=cache`（依赖上述语法），以保证默认 docker driver 可构建。
#
# 关键优化（2026-07）：
# - 运行镜像只拷「生产依赖」（prod-deps 阶段），不再拷带 dev 依赖的完整 node_modules。
#   dev-only 的大件（sharp 原生二进制、playwright、typescript、tailwindcss、drizzle-kit 等）
#   不进运行镜像，镜像体积显著下降 → 每次部署占用磁盘更少、导出/切换更快、更不容易把盘写满。
#   内嵌 worker 靠 `tsx`（已提为生产依赖）运行，migrate.js 只用 pg，均在生产依赖闭包内。
# - pnpm 安装带「镜像源失败回退」：主源(npmmirror)超时即切换到备用源(腾讯云)，避免卡在超长重试。
#
# 可选 Build Args（在 Coolify「Build Arguments」中设置）：
# - PNPM_REGISTRY          主 npm 源；国内默认 https://registry.npmmirror.com
# - PNPM_REGISTRY_FALLBACK 备用源；主源超时后自动切换

FROM node:22-alpine AS base
RUN apk add --no-cache ca-certificates libc6-compat
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_REGISTRY_FALLBACK=https://mirrors.cloud.tencent.com/npm/
ENV PNPM_REGISTRY=${PNPM_REGISTRY}
ENV PNPM_REGISTRY_FALLBACK=${PNPM_REGISTRY_FALLBACK}

# 公共 pnpm 配置：更短的重试退避（原来最长退避 120s，超时时会白等 2 分钟）
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate \
 && pnpm config set fetch-retries 5 \
 && pnpm config set fetch-retry-mintimeout 10000 \
 && pnpm config set fetch-retry-maxtimeout 30000

# ---- 第一阶段：完整依赖（供 builder 编译，含 dev 依赖）----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm config set registry "$PNPM_REGISTRY" \
 && ( pnpm install --frozen-lockfile \
      || ( echo "[deps] 主源失败，切换备用源 $PNPM_REGISTRY_FALLBACK" \
           && pnpm config set registry "$PNPM_REGISTRY_FALLBACK" \
           && pnpm install --frozen-lockfile ) )

# ---- 第二阶段：仅生产依赖（供运行镜像，体积小；与 builder 并行构建）----
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm config set registry "$PNPM_REGISTRY" \
 && ( pnpm install --frozen-lockfile --prod \
      || ( echo "[prod-deps] 主源失败，切换备用源 $PNPM_REGISTRY_FALLBACK" \
           && pnpm config set registry "$PNPM_REGISTRY_FALLBACK" \
           && pnpm install --frozen-lockfile --prod ) )

# ---- 第三阶段：编译打包 ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN pnpm run build

# ---- 第四阶段：运行镜像 ----
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
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# 关键：运行镜像只拷「生产依赖」（含 tsx，供内嵌 worker），不拷带 dev 的完整 node_modules
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "scripts/start-production.mjs"]
