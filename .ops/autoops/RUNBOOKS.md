# Auto-Ops Runbooks

所有 runbook 都必须是确定性的、有界的，并把执行结果写入 runtime evidence。任何需要修改仓库代码或配置的情况都必须停止自动化，创建 incident，再进入显式实现任务。

## disk_high

运行 `pnpm autoops:volc:clean-disk`。只清理 Docker builder cache、旧 unused image、stopped container 和过期 journal；不得触碰数据库目录或 Docker volume。未恢复时记录诊断并请求人工处理磁盘容量/保留策略。

## o11y_agent_disconnected

优先运行 `o11yagentctl restart`，否则尝试 systemd service，然后查询状态。失败时创建 incident 并附命令输出。

## app_health_failed

1. `pnpm autoops:coolify:restart`
2. `pnpm autoops:healthcheck`
3. 仍失败时可执行一次 `pnpm autoops:coolify:deploy -- --force`
4. 再次失败则停止自动化并创建 incident

## coolify_deploy_failed

收集 deployment evidence，并按 `deploy-selfheal.mjs` 的边界进行有限重试。若诊断为代码/配置问题或重试耗尽，停止并留下 incident。

## sentry_code_error / apm_slow_endpoint / build_failed

只收集 evidence 并创建 incident。不得自动调用 Codex/Claude、不得自动改测试或生产代码、不得 commit/push。

## unknown

只记录和诊断，要求 operator review。
