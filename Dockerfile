FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:20-alpine AS base
RUN apk add --no-cache ca-certificates libc6-compat

# ---- 第一阶段：安装依赖 ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
# 【关键修复】彻底抛弃 corepack，改用 npm 全局直装 pnpm，绕过签名校验报错
RUN npm install -g pnpm
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
# 声明后端环境变量
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
# 【架构师提醒】如果你有 NEXT_PUBLIC_ 开头的变量，请在这里全部加上 ARG，例如：
# ARG NEXT_PUBLIC_XXX
# ENV NEXT_PUBLIC_XXX=$NEXT_PUBLIC_XXX

ENV NEXT_TELEMETRY_DISABLED=1
# 【关键修复】同样使用 npm 安装 pnpm，确保 build 阶段有 pnpm 可用
RUN npm install -g pnpm
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
CMD ["sh", "-c", "if [ \"${MIGRATE_ON_BOOT}\" = \"1\" ]; then node scripts/migrate.js; fi; node server.js"]