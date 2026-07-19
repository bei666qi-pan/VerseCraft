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
#   回退只在整条 install 命令退出非零时触发（command 级 `||`），抓不住"单个包被限速/超时、
#   pnpm 自己按 fetch-retries 退避重试但最终仍会成功或失败"这种情况——2026-07 的一次部署失败
#   正是如此：单包 ETIMEDOUT 导致整条 install 卡了数分钟。因此额外加了两层加固：
#   降低 network-concurrency 减少单包被限速概率；给 install 套 timeout，卡够久直接换源重来，
#   不用等到 fetch-retries 全部耗尽。timeout 阈值参考真实观测（一次正常重试耗时约 5m17s）留出余量。
#
# 可选 Build Args（在 Coolify「Build Arguments」中设置）：
# - NODE_IMAGE             Node 基础镜像；默认国内镜像代理，避免 Docker Hub metadata 超时
# - PNPM_REGISTRY          主 npm 源；国内默认 https://registry.npmmirror.com
# - PNPM_REGISTRY_FALLBACK 备用源；主源超时后自动切换

ARG NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache ca-certificates libc6-compat
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_REGISTRY_FALLBACK=https://mirrors.cloud.tencent.com/npm/
ENV PNPM_REGISTRY=${PNPM_REGISTRY}
ENV PNPM_REGISTRY_FALLBACK=${PNPM_REGISTRY_FALLBACK}

# 公共 pnpm 配置：更短的重试退避（原来最长退避 120s，超时时会白等 2 分钟）+
# 调低并发（默认约16）降低国内镜像源单包被限速/超时的概率
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate \
 && pnpm config set fetch-retries 6 \
 && pnpm config set fetch-retry-mintimeout 10000 \
 && pnpm config set fetch-retry-maxtimeout 30000 \
 && pnpm config set network-concurrency 8

# ---- 第一阶段：锁文件驱动的 package store（冷构建只下载一次）----
# 不使用 BuildKit cache mount：当前 Coolify builder 明确不支持 BuildKit。
# 普通 Docker layer cache 仍会在 pnpm-lock.yaml 未变化的源码发布中复用本层；
# 冷缓存时后续 full/prod install 都离线复用同一个 store，避免重复网络下载。
FROM base AS package-cache
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm config set registry "$PNPM_REGISTRY" \
 && ( timeout 480 pnpm fetch --frozen-lockfile \
      || ( echo "[package-cache] 主源超时/失败，切换备用源 $PNPM_REGISTRY_FALLBACK" \
           && pnpm config set registry "$PNPM_REGISTRY_FALLBACK" \
           && pnpm fetch --frozen-lockfile ) )

# ---- 第二阶段：完整依赖（供 builder 编译，含 dev 依赖）----
FROM package-cache AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --offline --frozen-lockfile

# ---- 第三阶段：仅生产依赖（供运行镜像，体积小；与 builder 并行构建）----
FROM package-cache AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --offline --frozen-lockfile --prod

# ---- 第四阶段：编译打包 ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN pnpm run build

# ---- 第五阶段：运行镜像 ----
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
