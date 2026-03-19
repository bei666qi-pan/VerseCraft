FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:20-alpine AS base
RUN apk add --no-cache ca-certificates libc6-compat

# ---- 第一阶段：安装依赖 ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
# Avoid Corepack signature failures in some CI/build hosts.
RUN npm install -g pnpm@10.0.0
RUN pnpm config set registry https://registry.npmmirror.com/
RUN pnpm config set fetch-retries 5
RUN pnpm config set fetch-retry-mintimeout 20000
RUN pnpm config set fetch-retry-maxtimeout 120000
RUN pnpm install --frozen-lockfile

# ---- 第二阶段：编译打包 ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Keep pnpm version consistent with packageManager field.
RUN npm install -g pnpm@10.0.0
RUN pnpm run build

# ---- 第三阶段：极简运行环境 ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV MIGRATE_ON_BOOT=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone 模式的完美拷贝
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# 拷贝数据库迁移脚本
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.js ./scripts/migrate.js

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "if [ \"${MIGRATE_ON_BOOT}\" = \"1\" ]; then node scripts/migrate.js; fi; node server.js"]