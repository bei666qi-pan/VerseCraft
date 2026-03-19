# Coolify 部署说明（生产）

生产环境统一由 Coolify 管理，密码与密钥全部在 Coolify 的 Environment Variables 面板配置。

## Coolify 配置建议

- Build Pack: Dockerfile（推荐）或 Nixpacks（Node）
- Port: `3000`
- Health Check: `GET /api/health`
- Auto Deploy: 可开启（按团队流程）

## 方案 A：使用 Dockerfile

仓库已提供 `Dockerfile`，Coolify 触发构建即可。

关键变量（在 Coolify 面板填写）：

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `ADMIN_PASSWORD`
- `ALTCHA_HMAC_KEY`
- `VOLCENGINE_API_KEY`
- `VOLCENGINE_ENDPOINT_ID`
- `VOLCENGINE_DEEPSEEK_API_URL`（可选）
- `VOLCENGINE_DEEPSEEK_MODEL`（可选）
- `MIGRATE_ON_BOOT=1`
- `RUNTIME_SCHEMA_ENSURE=1`
- `DAILY_TOKEN_LIMIT=50000`（可选）
- `DAILY_ACTION_LIMIT=200`（可选）
- `SECURITY_MODERATION_ENABLED=true`
- `SECURITY_MODERATION_PROVIDER=auto`（推荐）
- `SECURITY_MODERATION_TIMEOUT_MS=3000`
- `SECURITY_MODERATION_FAIL_OPEN=true`
- `SECURITY_AUDIT_LOG_LEVEL=warn`
- `MODERATION_ENABLED=true`（推荐，兼容旧命名）
- `MODERATION_PROVIDER=auto`（推荐，兼容旧命名）
- `MODERATION_TIMEOUT_MS=3000`（推荐，兼容旧命名）
- `MODERATION_FAIL_OPEN=true`（推荐，兼容旧命名）
- `SECURITY_LOG_LEVEL=warn`（推荐，兼容旧命名）
- `SECURITY_IP_LIMIT_PER_MINUTE=30`
- `SECURITY_SESSION_LIMIT_PER_MINUTE=24`
- `SECURITY_USER_LIMIT_PER_MINUTE=20`
- `SECURITY_HIGH_RISK_STRIKE_THRESHOLD=3`
- `SECURITY_TEMP_BLOCK_SECONDS=600`
- `VOLCENGINE_SAFETY_ENDPOINT`（可选）
- `VOLCENGINE_SAFETY_API_KEY`（可选）
- `VOLCENGINE_SAFETY_API_SECRET`（可选）
- `VOLCENGINE_SAFETY_APP_ID`（可选）
- `VOLCENGINE_SAFETY_REGION`（可选）

## 方案 B：使用命令构建/启动

- Build Command: `pnpm install --frozen-lockfile && pnpm build`
- Start Command: `pnpm start`

## 部署后验证

1. 打开健康检查：`/api/health` 返回 `ok: true`
2. 登录与注册流程可用
3. 进入 `/play`，触发一次 `/api/chat` SSE
4. Coolify Logs 中无 `Missing required env var` 报错
