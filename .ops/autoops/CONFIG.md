# Auto-Ops Configuration

## Defaults

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTOOPS_SITE_URL` | `https://versecraft.cn` | Site smoke check |
| `AUTOOPS_HEALTH_URL` | `https://versecraft.cn/api/health` | Main healthcheck |
| `AUTOOPS_REPO` | `bei666qi-pan/VerseCraft` | GitHub repo |
| `AUTOOPS_BRANCH` | `main` | Repository context for evidence links |
| `AUTOOPS_DEPLOY_MODE` | `observe` | Keep existing CI/Gitee/Coolify chain by default |

## Secrets

| Variable | Purpose |
| --- | --- |
| `COOLIFY_API_KEY` | Coolify API |
| `COOLIFY_BASE_URL` | Coolify root or `/api/v1` URL |
| `AUTOOPS_ALERT_ROUTER_SECRET` | Deprecated — APIG/VeFaaS removed. Scheduled GitHub Actions replaces webhook |
| `VOLC_AK` | Volcengine OpenAPI AK |
| `VOLC_SK` | Volcengine OpenAPI SK |
| `VOLC_REGION` | Usually `cn-shanghai` |
| `COOLIFY_APP_UUID` | Auto-discovered production VerseCraft app |
| `VOLC_ECS_INSTANCE_IDS` | Auto-discovered ECS instance ids |
| `DEEPSEEK_API_KEY` | DeepSeek backend (`lib/agent-runner.mjs`) + `deploy-selfheal.mjs`'s diagnosis step. Local-only, put in `.env.local`, never in Coolify env vars or GitHub Secrets. |

Do not set `OPENAI_API_KEY` for auto-ops. Do not sync a repository secret named `GITHUB_TOKEN`; workflows use built-in `github.token`.

AutoOps does not accept a code-writer command or code-fix mode. Code/configuration findings are handed to an explicit implementation task.

## Auto Discovery

`pnpm autoops:discover` writes:

- `.ops/autoops/runtime/coolify-discovery.json`
- `.ops/autoops/runtime/volc-discovery.json`
- `.ops/autoops/runtime/discovery-report.json`

If discovery cannot uniquely identify resources, set `COOLIFY_APP_UUID` and `VOLC_ECS_INSTANCE_IDS` manually in the local environment and GitHub Secrets.
