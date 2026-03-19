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
