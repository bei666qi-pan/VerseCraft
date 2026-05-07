# Auto-Ops Runbooks

## disk_high

Fast path: `pnpm autoops:volc:clean-disk`

Action: run Volc ECS Cloud Assistant to prune Docker builder cache, old unused images, stopped containers, and old journal logs. It must not touch database persistence directories or Docker volumes.

Failure: collect `diagnose` and `docker-diagnose` evidence, then dispatch `autoops-codex`. That workflow creates an issue and a local Codex prompt; it does not run cloud Codex.

## o11y_agent_disconnected

Fast path: `pnpm autoops:volc:restart-o11y`

Action: prefer `o11yagentctl restart`, otherwise try the systemd `o11yagent` service, then query status.

Failure: create/update an incident issue with `codex-needed` and use local Codex if a code or runbook fix is needed.

## app_health_failed

Fast path:

1. `pnpm autoops:coolify:restart`
2. `pnpm autoops:healthcheck`
3. If still failing: `pnpm autoops:coolify:deploy -- --force`
4. If still failing: dispatch `autoops-codex` for local Codex handoff

## coolify_deploy_failed

Fast path: collect deployment evidence and redeploy once. If deployment keeps failing, hand off to local Codex.

## sentry_code_error

Slow path: direct `autoops-codex` handoff. The local runner command is:

```bash
pnpm autoops:local-codex -- --issue <issue_number> --push-main
```

## apm_slow_endpoint

Slow path: collect evidence first, then local Codex. If this touches `/api/chat`, preserve SSE framing and latency budget behavior.

## build_failed

Slow path: local Codex. Validation must include at least:

```bash
pnpm lint
pnpm test:unit
pnpm db:check:optional
pnpm build
```

## unknown

Default: collect evidence, create an incident issue, and require local operator review before code repair.

## Local Codex Availability

If the local computer is offline, GitHub Actions can still run server runbooks, but code repair will wait. Start the loop with:

```bash
pnpm autoops:local-loop -- --interval-ms 300000 --push-main
```
