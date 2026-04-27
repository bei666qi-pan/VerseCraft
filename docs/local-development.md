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

可选：配置类与 AI 路由回归（无需外网密钥即可跑大部分用例）：

```bash
pnpm test:unit
```

3. 浏览器访问：**http://localhost:666**（本地开发固定 666，不再使用 3000）。**请使用 `http://`（勿用 `https://`，除非显式启用实验性 HTTPS）。**

## 排障（打不开 / 白屏）

- **连接被拒绝**：确认已执行 `pnpm dev` 且终端无 `EADDRINUSE`；可尝试 **http://127.0.0.1:666**（部分环境下 `localhost` 会优先走 IPv6）。
- **登录/跳转异常**：将 `AUTH_URL` / `NEXTAUTH_URL` 设为当前浏览器地址（含端口 666），避免仍指向 `:3000`。
- **VPN / 代理（如 Clash）**：`next dev` 可能打印 `Network: http://198.18.x.x:666`。若必须用该地址访问，在 `.env.local` 中设置 `NEXT_DEV_ALLOWED_ORIGINS`（逗号分隔主机名，勿含端口），与 `next.config.ts` 中 `allowedDevOrigins` 扩展一致。
- **Windows + Playwright**：`webServer` 已使用 `pnpm dev`，勿依赖 `PORT=... pnpm dev` 类 Unix 写法。
- **Codex Browser Use / node_repl**：必须解析到 Node `>=22.22.0`。若 `where node` 优先命中旧版 `D:\node\node.exe`，请将用户环境变量 `NODE_REPL_NODE_PATH` 指向 `D:\node-v22.22.2\node.exe` 或其他合格 Node；改完后重启 Codex app，确保 Browser Use 的 MCP 进程继承新环境。

## 必填变量

- `DATABASE_URL`: 本地/测试 PostgreSQL 连接串（Docker 共用实例分库时可先执行 `pnpm postgres:local`，见 [`local-one-api.md`](local-one-api.md)）
- `REDIS_URL`: 本地/测试 Redis 连接串（可选，留空会退化为内存限流）
- `AUTH_SECRET`: NextAuth 签名密钥
- `ADMIN_PASSWORD`: 管理员影子入口密码
- `ALTCHA_HMAC_KEY`: Altcha HMAC 密钥（不填则使用 `AUTH_SECRET`）
- **大模型（one-api）**：`AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`，以及 `AI_MODEL_MAIN` / `AI_MODEL_CONTROL` / `AI_MODEL_ENHANCE` / `AI_MODEL_REASONER`（与 `.env.example` 一致；说明见 [`docs/ai-gateway.md`](ai-gateway.md)）。**逐步对接本地网关**：[`docs/local-one-api.md`](local-one-api.md)；可复制 [`.env.local.oneapi.example`](../.env.local.oneapi.example) 或运行 `pnpm patch:env-local-ai`。

## 可选变量

- `AI_PLAYER_ROLE_CHAIN`、`AI_REQUEST_TIMEOUT_MS`、`AI_ENABLE_STREAM`、`AI_LOG_LEVEL` 等（见 `.env.example`）
- `MIGRATE_ON_BOOT`（默认 `1`）
- `RUNTIME_SCHEMA_ENSURE`（默认 `1`）
- `DAILY_TOKEN_LIMIT`（默认 `50000`）
- `DAILY_ACTION_LIMIT`（默认 `200`）
- `MODERATION_ENABLED`（默认 `true`）
- `MODERATION_PROVIDER`（`auto | local-rules`）
- `MODERATION_TIMEOUT_MS`（默认 `3000`）
- `MODERATION_FAIL_OPEN`（默认 `true`）
- `SECURITY_LOG_LEVEL`（`silent | warn | info | debug`）
- 旧名仍可读：`SECURITY_MODERATION_*`、`SECURITY_AUDIT_LOG_LEVEL`（见 `docs/environment.md`）
- `SECURITY_IP_LIMIT_PER_MINUTE`（默认 `30`）
- `SECURITY_SESSION_LIMIT_PER_MINUTE`（默认 `24`）
- `SECURITY_USER_LIMIT_PER_MINUTE`（默认 `20`）
- `SECURITY_HIGH_RISK_STRIKE_THRESHOLD`（默认 `3`）
- `SECURITY_TEMP_BLOCK_SECONDS`（默认 `600`）
- 安全审核仅使用本地规则（`MODERATION_PROVIDER=local-rules`）
