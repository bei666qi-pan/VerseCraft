## Why

当前 Langfuse 仅作为"只写"端使用 — 上报 trace/score 数据但不在管理后台消费。运维人员查看模型延迟、成功率、成本、Score 趋势等关键指标只能登录 Langfuse Cloud UI，无法在自研 Dashboard 完成端到端可观测。同时 selfImprove Eval 体系将 trace 和评分存储在本地 JSONL，缺乏集中检索、聚合和对比能力。升级 Langfuse 为可读数据源可统一观测入口并提升排障效率。

## What Changes

- **新增 Langfuse 查询客户端**：封装 `@langfuse/client` 的 REST API 读取，提供 trace 列表/详情、scores 聚合、metrics 统计等查询函数，全部 fail-open 降级。
- **新增 Admin API 端点 `/api/admin/langfuse/*`**：6 个受 `verifyAdminRequest` 保护的端点，返回 `AdminApiEnvelope<T>`。
- **Dashboard 新增第 10 个 Tab**：「Langfuse 可观测」面板，包含 Trace 浏览器、Score 趋势、模型性能、成本仪表盘、健康检查五个子面板。纯 CSS/Tailwind 实现，不引入图表库。
- **Eval 体系 Langfuse 化**：selfImprove 新增 dataset 创建、experiment 运行、trace 上传模块；CLI 新增 `--langfuse` 标志；本地 JSONL 存储保留作为 fallback。
- **配置与功能开关**：3 个新环境变量（`VERSECRAFT_ENABLE_LANGFUSE_READ`、`VERSECRAFT_LANGFUSE_READ_TIMEOUT_MS`、`VERSECRAFT_LANGFUSE_EVAL_ENABLED`），与现有 Langfuse 写入开关完全独立。

## Capabilities

### New Capabilities
- `langfuse-query-client`: Langfuse 只读查询客户端，封装 REST API 的 trace/scores/metrics 读取，fail-open 降级
- `langfuse-admin-api`: Admin API 端点层，提供 trace 列表/详情、scores 聚合、observations 分布、成本拆解、健康检查
- `langfuse-dashboard-tab`: Dashboard 第 10 个 Tab「Langfuse 可观测」，含 Trace 浏览器、Score 趋势、模型性能、成本仪表盘、健康检查
- `langfuse-eval-integration`: selfImprove Eval 体系与 Langfuse dataset/experiment/trace 集成

### Modified Capabilities
<!-- 此项变更不修改任何现有 spec 中的需求，所有能力均为新增。 -->

## Impact

- **受影响文件**：`src/lib/observability/langfuse/`（新增 queryClient.ts）、`src/app/api/admin/langfuse/`（新增 6 个端点）、`src/components/admin/AdminDashboardV2.tsx`（新增 Tab）、`src/lib/evals/selfImprove/`（新增 3 个模块）、`src/lib/config/serverConfig.ts`（新增配置项）、`.env.example`（同步）
- **不受影响**：`/api/chat` SSE 合约、DM JSON 格式、`resolveDmTurn`、主游戏 store、数据库 schema、现有 Langfuse 写入端（tracing/scores/generation）、AdminDashboardV2 现有 9 个 Tab
- **性能**：Dashboard 数据通过 HTTP API 拉取，不影响 `/api/chat` 首字前路径。所有查询 fail-open，超时默认 5000ms
- **依赖**：无新依赖（`@langfuse/client` 已在 `package.json` 中）
