# Coolify 部署说明（生产）

生产环境统一由 Coolify 管理，密码与密钥全部在 Coolify 的 Environment Variables 面板配置。

## Coolify 配置建议

- Build Pack: Dockerfile（推荐）或 Nixpacks（Node）
- Port: `3000`
- Health Check: `GET /api/health`
- Auto Deploy: 可开启（按团队流程）

### 反代与 `csrf_check_failed`

若前面仍有反代（Nginx / Traefik 等），请确保转发头正确，否则浏览器 `Origin` 与 Next 侧推断的公共 origin 会不一致，中间件会返回 `403 csrf_check_failed`：

- `X-Forwarded-Proto`：客户端实际使用的协议（如 `https`）
- `X-Forwarded-Host`：客户端实际访问的主机（含端口，如 `14.103.217.111:3000`）

应用已优先用上述头计算「期望 origin」，与 POST 请求的 `Origin` 比对。

### 部署版本与长开标签页

建议每次部署设置 **`NEXT_PUBLIC_BUILD_ID` 或 `BUILD_ID`**（与上次不同，例如 Git commit SHA）。客户端会轮询 `GET /api/build-id`，发现变化后自动 `reload`，避免旧 `_next` 壳与 Server Action 映射错位。

- 验证：`GET /api/build-id` 返回的 `buildId` 在每次部署后应变化。

## 方案 A：使用 Dockerfile

仓库已提供 `Dockerfile`，Coolify 触发构建即可。

关键变量（在 Coolify 面板填写）：

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `ADMIN_PASSWORD`
- `ALTCHA_HMAC_KEY`
- `DEEPSEEK_API_KEY`（玩家主叙事优先使用）
- `DEEPSEEK_MODEL`（可选，默认 `deepseek-v3.2`）
- `DEEPSEEK_API_URL`（可选，默认 `https://api.deepseek.com/chat/completions`）
- `ZHIPU_API_KEY`（或 `BIGMODEL_API_KEY`；控制面 / 意图 / 安全预筛 / fallback）
- `ZHIPU_MODEL`（可选，默认 `glm-5-air`）
- `ZHIPU_API_URL`（可选）
- `MINIMAX_API_KEY`（仅增强类任务；勿期望进入 `PLAYER_CHAT` 主链）
- `MINIMAX_MODEL`（可选，默认 `MiniMax-M2.7-highspeed`）
- `MINIMAX_API_URL`（可选）
- `AI_PLAYER_MODEL_CHAIN`（可选；默认 `deepseek-v3.2,glm-5-air`）
- `AI_OPERATION_MODE`：`full` \| `safe` \| `emergency`（紧急模式仅 DeepSeek-V3.2）
- `MIGRATE_ON_BOOT=1`
- `RUNTIME_SCHEMA_ENSURE=1`
- `DAILY_TOKEN_LIMIT=50000`（可选）
- `DAILY_ACTION_LIMIT=200`（可选）
- `MODERATION_ENABLED=true`
- `MODERATION_PROVIDER=auto`（推荐）
- `MODERATION_TIMEOUT_MS=3000`
- `MODERATION_FAIL_OPEN=true`
- `SECURITY_LOG_LEVEL=warn`（`silent | warn | info | debug`）
- （可选）`AUDIT_HMAC_SECRET` — 不设则复用 `AUTH_SECRET` 签名 `/api/audit`
- 旧名仍可读：`SECURITY_MODERATION_*`、`SECURITY_AUDIT_LOG_LEVEL`、`SECRET_KEY`（见 `docs/environment.md`）
- `SECURITY_IP_LIMIT_PER_MINUTE=30`
- `SECURITY_SESSION_LIMIT_PER_MINUTE=24`
- `SECURITY_USER_LIMIT_PER_MINUTE=20`
- `SECURITY_HIGH_RISK_STRIKE_THRESHOLD=3`
- `SECURITY_TEMP_BLOCK_SECONDS=600`
- 安全审核仅使用本地规则（无需第三方安全厂商密钥）

## 方案 B：使用命令构建/启动

- Build Command: `pnpm install --frozen-lockfile && pnpm test:ci`（与 GitHub `ci.yml` 对齐：eslint + 单测 + `pnpm build`）
- Start Command: `pnpm start`

若 Coolify **仅**同步镜像、不跑 GitHub Actions，请至少在构建阶段执行 `pnpm test:ci`，避免「只打镜像、未跑 CI」时的类型/构建回归漏检。

## 部署后验证

1. 打开健康检查：`/api/health` 返回 `ok: true`
2. 登录与注册流程可用
3. 进入 `/play`，触发一次 `/api/chat` SSE
4. Coolify Logs 中无 `Missing required env var` 报错
