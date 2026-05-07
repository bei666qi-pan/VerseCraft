# Auto-Ops Configuration

## Defaults

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTOOPS_SITE_URL` | `https://versecraft.cn` | Site smoke check |
| `AUTOOPS_HEALTH_URL` | `https://versecraft.cn/api/health` | Main healthcheck |
| `AUTOOPS_REPO` | `bei666qi-pan/VerseCraft` | GitHub repo |
| `AUTOOPS_BRANCH` | `main` | Repair branch |
| `AUTOOPS_DEPLOY_MODE` | `observe` | Keep existing CI/Gitee/Coolify chain by default |
| `AUTOOPS_CODE_FIX_MODE` | `local` | Code repair runs on local Codex, not GitHub Actions |

## Secrets

| Variable | Purpose |
| --- | --- |
| `COOLIFY_API_KEY` | Coolify API |
| `COOLIFY_BASE_URL` | Coolify root or `/api/v1` URL |
| `AUTOOPS_ALERT_ROUTER_SECRET` | APIG/veFaaS webhook verification |
| `VOLC_AK` | Volcengine OpenAPI AK |
| `VOLC_SK` | Volcengine OpenAPI SK |
| `VOLC_REGION` | Usually `cn-shanghai` |
| `COOLIFY_APP_UUID` | Auto-discovered production VerseCraft app |
| `VOLC_ECS_INSTANCE_IDS` | Auto-discovered ECS instance ids |

Do not set `OPENAI_API_KEY` for auto-ops. Do not sync a repository secret named `GITHUB_TOKEN`; workflows use built-in `github.token`.

## Local Only

| Variable | Purpose |
| --- | --- |
| `AUTOOPS_CODEX_COMMAND` | Optional non-interactive local Codex command override |
| `AUTOOPS_APIG_BASE_URL` | Final APIG base URL for provision report |
| `AUTOOPS_VEFAAS_FUNCTION_NAME` | Defaults to `versecraft-autoops-alert-router` |
| `AUTOOPS_ALERT_DEDUPE_TTL_MS` | In-memory alert-router dedupe window |
| `AUTOOPS_ALERT_ROUTER_DRY_RUN` | `1` disables external side effects in alert-router |

## Auto Discovery

`pnpm autoops:discover` writes:

- `.ops/autoops/runtime/coolify-discovery.json`
- `.ops/autoops/runtime/volc-discovery.json`
- `.ops/autoops/runtime/discovery-report.json`

If discovery cannot uniquely identify resources, set `COOLIFY_APP_UUID` and `VOLC_ECS_INSTANCE_IDS` manually in the local environment and GitHub Secrets.
