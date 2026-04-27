# VerseCraft 预览站部署说明

预览站链路：

`GitHub preview -> Gitee preview -> Coolify versecraft-preview -> preview.versecraft.cn`

生产站链路保持独立：

`GitHub main -> 生产部署 -> versecraft.cn`

GitHub 是源仓库，Gitee 只作为 Coolify 可拉取的国内镜像。不要把任何真实密钥、数据库 URL、API Key、密码写入仓库。

## GitHub Secrets

`sync-gitee-preview.yml` 默认同步到 `https://gitee.com/bei-qi-luo/VerseCraft.git`。如需覆盖目标仓库，可配置：

- `GITEE_REPO_URL`：可选，例如 `https://gitee.com/<owner>/VerseCraft.git`
- `GITEE_TOKEN`：必需，Gitee Personal Access Token，只授予目标仓库写权限

workflow 会把 GitHub `preview` 当前 HEAD 同步到 Gitee `preview` 分支。它不会打印带 token 的 remote URL。

## Preview Coolify 环境变量

预览站 Coolify 必须使用独立的数据库、Redis、Auth/Admin 密钥和 AI 网关密钥，不得复用生产值。

建议配置：

- `ENVIRONMENT_NAME=preview`
- `APP_URL=https://preview.versecraft.cn`
- `NEXT_PUBLIC_APP_URL=https://preview.versecraft.cn`
- `DATABASE_URL=<preview database url>`
- `REDIS_URL=<preview redis url>`
- `AUTH_SECRET=<preview only secret>`
- `AUTH_TRUST_HOST=true`
- `ADMIN_PASSWORD=<preview only admin password>`
- `PREVIEW_ACCESS_ENABLED=true`
- `PREVIEW_ACCESS_HOSTS=preview.versecraft.cn`
- `PREVIEW_ACCESS_PASSWORD=<preview access password>`
- `PREVIEW_ACCESS_COOKIE_SECRET=<long random preview cookie secret>`
- `PREVIEW_ACCESS_COOKIE_NAME=vc_preview_access`
- `PREVIEW_ACCESS_MAX_AGE_SECONDS=604800`
- `PRODUCTION_DATABASE_URL_FINGERPRINT=<optional sha256 fingerprint>`
- `PREVIEW_DATABASE_URL_FINGERPRINT=<optional sha256 fingerprint>`
- `AI_GATEWAY_BASE_URL=<preview one-api gateway url>`
- `AI_GATEWAY_API_KEY=<preview one-api key>`
- `AI_MODEL_MAIN=<gateway model>`
- `AI_MODEL_CONTROL=<gateway model>`
- `AI_MODEL_ENHANCE=<gateway model>`
- `AI_MODEL_REASONER=<gateway model>`
- `MIGRATE_ON_BOOT=1`
- `RUNTIME_SCHEMA_ENSURE=1`
- `DAILY_TOKEN_LIMIT=5000`
- `DAILY_ACTION_LIMIT=50`

生产环境不要设置 `ENVIRONMENT_NAME=preview`，也不要把 `PREVIEW_ACCESS_ENABLED=true` 配给生产 host。

## 数据库防误连

当 `ENVIRONMENT_NAME=preview`，或 `APP_URL` / `NEXT_PUBLIC_APP_URL` 包含 `preview.versecraft.cn` 时，应用启动期会检查 `DATABASE_URL`：

- host 或 database name 中出现 `versecraft_prod`、`prod`、`production` 会启动失败。
- 如果配置了 `PRODUCTION_DATABASE_URL_FINGERPRINT`，当前数据库 URL 指纹命中该值会启动失败。
- 如果配置了 `PREVIEW_DATABASE_URL_FINGERPRINT`，当前数据库 URL 指纹不匹配该值会启动失败。
- 错误日志不会打印完整 `DATABASE_URL`。

指纹算法固定为：对规范化后的数据库 URL 做 SHA-256，输出 hex。

## 验收步骤

1. GitHub Actions `CI` 在 `preview` 分支通过。
2. GitHub Actions `Sync Gitee Preview` 成功。
3. Gitee `preview` 分支更新到对应 GitHub commit。
4. Coolify `versecraft-preview` 部署成功，端口为 `3000`。
5. `https://preview.versecraft.cn/api/health` 返回 `ok: true`，无需预览访问 cookie。
6. 打开 `https://preview.versecraft.cn` 会进入“预览站访问验证”页面。
7. 错误密码只显示“访问密码错误”。
8. 正确密码通过后可进入 `/play`，响应头包含 `X-Robots-Tag: noindex, nofollow`。
