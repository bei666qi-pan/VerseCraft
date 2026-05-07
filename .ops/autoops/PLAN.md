# VerseCraft Auto-Ops 改造计划

## 勘察结论

- 仓库是 Next.js 16 / React 19 / TypeScript / pnpm 项目，`packageManager` 为 `pnpm@10.0.0`，Node 基线为 `>=22.22.0`。
- `Dockerfile` 已使用 `output: "standalone"`，生产端口为 `3000`，并内置 `/api/health` HEALTHCHECK。
- `/api/health` 当前做数据库 `SELECT 1` 和 AI key 配置探测，返回 JSON 健康状态。
- 现有 GitHub Actions 包含 `CI`、`AI gateway verify (manual)` 和 `Sync Gitee Branches`；后者在 CI 成功后同步 Gitee 并触发 Coolify webhook。
- 现有验证脚本已覆盖 `pnpm lint`、`pnpm test:unit`、`pnpm db:check:optional`、`pnpm build`、mock/contract e2e、chat benchmark/eval、admin smoke。

## 改造目标

1. 新增 `.ops/autoops` 文档、运行时目录、告警模板和事故记录说明。
2. 新增 `ops/vefaas-alert-router`：快速验签、去重、分类，低风险告警走 Coolify / 火山 ECS 云助手快路径，复杂问题触发 GitHub `repository_dispatch`。
3. 新增 `scripts/autoops`：封装 GitHub、Coolify、火山 OpenAPI、健康检查、证据采集、事故 issue、模拟告警、自检、回滚。
4. 新增 GitHub Actions：
   - `autoops-runbook.yml`：处理 `autoops-runbook` / `autoops-record`，低风险快修，失败升级。
   - `autoops-codex.yml`：收集证据、生成 Codex prompt、可选调用 `openai/codex-action`、验证、提交、部署、健康检查与回滚。
   - `autoops-postdeploy.yml`：只对 auto-ops commit 或手动输入执行 postdeploy 验证。
5. 新增 package scripts，保持所有入口可 dry-run、可重复运行、输出结构化 JSON。

## 架构原则

- 告警回调不做长同步任务，目标 1 秒内返回。
- `repository_dispatch` payload 只传 `incident_key`、`source`、`severity`、`resource_id`、`alert_type`、`trace_id`、`created_at` 等小字段。
- 完整日志由后续脚本主动通过 Coolify API、火山 ECS 云助手、健康检查和仓库状态采集。
- 同一 `incident_key` 在 GitHub Actions 中不并发。
- 快路径目标 30 秒到 3 分钟；Codex 慢路径目标 5 到 45 分钟。
- Coolify API 部署与 GitHub/Coolify 自动部署必须二选一，避免重复部署记录。

## 实现顺序

1. 文档与模板。
2. 公共库：logger、incident key、alert classify、GitHub、Coolify、Volc OpenAPI、healthcheck。
3. CLI 脚本：discover、sync secrets、dispatch、run command、deploy/restart、healthcheck、simulate、自检、证据采集、issue、rollback。
4. veFaaS alert-router。
5. GitHub Actions 与 package scripts。
6. 本地验证：`pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm test:unit`、`pnpm db:check:optional`、`pnpm build`、`pnpm autoops:self-test`、两类 dry-run 模拟。

## 风险与处理

- 火山 veFaaS / APIG 的自动创建 API 在不同账号和产品版本间差异较大；脚本会先生成部署包和配置报告，无法确认时不阻塞仓库内自动化。
- 火山 ECS 云助手 OpenAPI 参数如账号区域存在差异，优先用官方 OpenAPI 签名调用并把请求依据写入文档；如果无法唯一发现 ECS，输出 `runtime/discovery-report.json` 让用户补充 `VOLC_ECS_INSTANCE_IDS`。
- `openai/codex-action` 需要 `OPENAI_API_KEY`，缺失时工作流跳过 Codex 修复并创建事故 issue，非 Codex runbook 仍可运行。
- 当前仓库已有 `Sync Gitee Branches` 触发 Coolify webhook；启用 auto-ops API 部署前必须关闭 Coolify/Gitee 侧自动部署或把 auto-ops 设置为 observe 模式。
