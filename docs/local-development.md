# 本地开发环境变量说明

本地开发统一使用 `.env.local`，不要提交到 Git。

## 步骤

1. 复制模板：

```bash
cp .env.example .env.local
```

2. 填写本地值并启动：

```bash
pnpm install
pnpm dev
```

3. 浏览器访问：**http://localhost:666**（本地开发固定 666，不再使用 3000）。**请使用 `http://`（勿用 `https://`，除非显式启用实验性 HTTPS）。**

## 排障（打不开 / 白屏）

- **连接被拒绝**：确认已执行 `pnpm dev` 且终端无 `EADDRINUSE`；可尝试 **http://127.0.0.1:666**（部分环境下 `localhost` 会优先走 IPv6）。
- **登录/跳转异常**：将 `AUTH_URL` / `NEXTAUTH_URL` 设为当前浏览器地址（含端口 666），避免仍指向 `:3000`。
- **VPN / 代理（如 Clash）**：`next dev` 可能打印 `Network: http://198.18.x.x:666`。若必须用该地址访问，在 `.env.local` 中设置 `NEXT_DEV_ALLOWED_ORIGINS`（逗号分隔主机名，勿含端口），与 `next.config.ts` 中 `allowedDevOrigins` 扩展一致。
- **Windows + Playwright**：`webServer` 已使用 `pnpm dev`，勿依赖 `PORT=... pnpm dev` 类 Unix 写法。

## 必填变量

- `DATABASE_URL`: 本地/测试 PostgreSQL 连接串
- `REDIS_URL`: 本地/测试 Redis 连接串（可选，留空会退化为内存限流）
- `AUTH_SECRET`: NextAuth 签名密钥
- `ADMIN_PASSWORD`: 管理员影子入口密码
- `ALTCHA_HMAC_KEY`: Altcha HMAC 密钥（不填则使用 `AUTH_SECRET`）
- `VOLCENGINE_API_KEY`: 大模型 API Key
- `VOLCENGINE_ENDPOINT_ID`: 大模型 Endpoint / Model Id

## 可选变量

- `VOLCENGINE_DEEPSEEK_API_URL`（默认官方网关）
- `VOLCENGINE_DEEPSEEK_MODEL`（默认 `deepseek-v3.2`）
- `ARK_*` / `DEEPSEEK_*` 兼容变量
- `MIGRATE_ON_BOOT`（默认 `1`）
- `RUNTIME_SCHEMA_ENSURE`（默认 `1`）
- `DAILY_TOKEN_LIMIT`（默认 `50000`）
- `DAILY_ACTION_LIMIT`（默认 `200`）
- `SECURITY_MODERATION_ENABLED`（默认 `true`）
- `SECURITY_MODERATION_PROVIDER`（`auto | local-rules | volcengine`）
- `SECURITY_MODERATION_TIMEOUT_MS`（默认 `3000`）
- `SECURITY_MODERATION_FAIL_OPEN`（默认 `true`）
- `SECURITY_AUDIT_LOG_LEVEL`（`silent | warn | info | debug`）
- `MODERATION_ENABLED` / `MODERATION_PROVIDER` / `MODERATION_TIMEOUT_MS` / `MODERATION_FAIL_OPEN` / `SECURITY_LOG_LEVEL`（推荐优先使用，向后兼容旧 `SECURITY_*` 命名）
- `SECURITY_IP_LIMIT_PER_MINUTE`（默认 `30`）
- `SECURITY_SESSION_LIMIT_PER_MINUTE`（默认 `24`）
- `SECURITY_USER_LIMIT_PER_MINUTE`（默认 `20`）
- `SECURITY_HIGH_RISK_STRIKE_THRESHOLD`（默认 `3`）
- `SECURITY_TEMP_BLOCK_SECONDS`（默认 `600`）
- `VOLCENGINE_SAFETY_*`（可留空；留空时自动使用 `local-rules`）
