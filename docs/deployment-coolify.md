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
- `X-Forwarded-Host`：客户端实际访问的主机（含端口，如 `versecraft.cn`）

应用已优先用上述头计算「期望 origin」，与 POST 请求的 `Origin` 比对。

### 部署版本与长开标签页

建议每次部署设置 **`NEXT_PUBLIC_BUILD_ID` 或 `BUILD_ID`**（与上次不同，例如 Git commit SHA）。客户端会轮询 `GET /api/build-id`，发现变化后自动 `reload`，避免旧 `_next` 壳与 Server Action 映射错位。

- 验证：`GET /api/build-id` 返回的 `buildId` 在每次部署后应变化。

## 方案 A：使用 Dockerfile

仓库已提供 `Dockerfile`，Coolify 触发构建即可。

`Dockerfile` **不包含** `# syntax=docker/dockerfile:*`，避免构建机必须访问 Docker Hub 拉取 Dockerfile 前端镜像；在仅内网或 Docker Hub 超时的环境（常见报错：`registry-1.docker.io` / `docker/dockerfile` i/o timeout）下仍可构建。多阶段 `deps` / `builder` 层在 Docker 本地层缓存仍可用。

### 构建参数（可选，提升成功率与速度）

| Build Arg | 说明 | 建议 |
|-----------|------|------|
| `DOCKER_IMAGE_BASE` | 基础镜像 | 默认 `node:20-alpine`。国内若拉基础镜像慢，可改为镜像加速地址，例如：`swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/node:20-alpine` |
| `PNPM_REGISTRY` | npm 镜像 | **留空**使用官方源。国内构建依赖慢时设为 `https://registry.npmmirror.com` |

### 健康检查

镜像将 `HEALTHCHECK` 的 `start-period` 设为 **60s**，为 `MIGRATE_ON_BOOT` 与首次监听端口留出时间，减少「刚启动即判失败」的部署重试。

### 环境变量（运行时）

关键变量（在 Coolify 面板填写）：

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `ADMIN_PASSWORD`
- `ALTCHA_HMAC_KEY`
- **one-api 网关**：`AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`
- **逻辑模型名（与 one-api 配置一致）**：`AI_MODEL_MAIN`、`AI_MODEL_CONTROL`、`AI_MODEL_ENHANCE`、`AI_MODEL_REASONER`
- `AI_PLAYER_ROLE_CHAIN`（可选，如 `main,control`）；遗留 `AI_PLAYER_MODEL_CHAIN` 仍可映射为角色
- `AI_OPERATION_MODE`：`full` \| `safe` \| `emergency`（紧急模式玩家链仅 `main` 角色）
- 详见 [`docs/ai-gateway.md`](ai-gateway.md)
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

### 预览站 `preview.versecraft.cn`

预览站使用独立 Coolify 应用，从 Gitee `preview` 分支拉取并部署，端口与健康检查保持不变：

- Port: `3000`
- Health Check: `GET /api/health`

预览站必须使用独立的数据库、Redis、Auth/Admin 密钥和 AI Key，不得复用生产值。建议额外配置：

- `ENVIRONMENT_NAME=preview`
- `APP_URL=https://preview.versecraft.cn`
- `NEXT_PUBLIC_APP_URL=https://preview.versecraft.cn`
- `PREVIEW_ACCESS_ENABLED=true`
- `PREVIEW_ACCESS_HOSTS=preview.versecraft.cn`
- `PREVIEW_ACCESS_PASSWORD=<preview access password>`
- `PREVIEW_ACCESS_COOKIE_SECRET=<long random preview cookie secret>`
- `PREVIEW_ACCESS_COOKIE_NAME=vc_preview_access`
- `PRODUCTION_DATABASE_URL_FINGERPRINT=<optional production database sha256>`
- `PREVIEW_DATABASE_URL_FINGERPRINT=<optional preview database sha256>`

预览站访问门禁不会保护 `/api/health`，便于 Coolify 健康检查；其他 API 在未授权时会返回 `401`，不会进入 AI 主链路。

### 可选：接入外部文本审核（百度文本审核/司南能力）作为风险信号
如果需要将外部文本审核能力纳入“风险信号之一”（但不作为唯一裁判），可在 Coolify 配置以下环境变量：

- `BAIDU_SINAN_ENABLED=true|false`
  - `false`：外部审核跳过（仍保留本地场景化策略与回退能力）
- 阶段开关：
  - `BAIDU_SINAN_INPUT_ENABLED=true|false`
  - `BAIDU_SINAN_OUTPUT_ENABLED=true|false`
  - `BAIDU_SINAN_PUBLIC_CONTENT_ENABLED=true|false`
- 失败模式（kill-switch / fail mode）：
  - `BAIDU_SINAN_FAIL_MODE_PRIVATE=fail_soft`（私密：优先降级回退，避免拖死体验）
  - `BAIDU_SINAN_FAIL_MODE_PUBLIC=fail_closed`（公开展示：外部审核不可用时更严格）
- 熔断（circuit breaker，避免并发故障时拖垮服务）：
  - `BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD`（连续失败阈值，默认 3）
  - `BAIDU_SINAN_CIRCUIT_WINDOW_MS`（统计窗口，默认 60000）
  - `BAIDU_SINAN_CIRCUIT_COOLDOWN_MS`（打开后冷却，默认 60000）
- 严格度配置（影响外部审核策略映射）：
  - `BAIDU_SINAN_STRICTNESS_PROFILE=balanced|strict|loose`

> 注意：外部审核结果仅作为风险信号之一。最终裁决仍由 VerseCraft 的场景化策略引擎（白名单、回退叙事、JSON 契约保序）决定。

## 方案 B：使用命令构建/启动

- Build Command: `pnpm install --frozen-lockfile && pnpm test:ci`（与 GitHub `ci.yml` 对齐：eslint + 单测 + `pnpm build`）
- Start Command: `pnpm start`

若 Coolify **仅**同步镜像、不跑 GitHub Actions，请至少在构建阶段执行 `pnpm test:ci`，避免「只打镜像、未跑 CI」时的类型/构建回归漏检。

## 部署后验证

1. 打开健康检查：`/api/health` 返回 `ok: true`
2. 登录与注册流程可用
3. 进入 `/play`，触发一次 `/api/chat` SSE
4. Coolify Logs 中无 `Missing required env var` 报错
