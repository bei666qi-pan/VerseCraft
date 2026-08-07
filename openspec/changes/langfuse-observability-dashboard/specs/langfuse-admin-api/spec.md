## ADDED Requirements

### Requirement: Admin API 端点统一前缀与认证

系统 SHALL 在 `src/app/api/admin/langfuse/` 下提供 6 个 API 端点，全部受 `verifyAdminRequest` 保护。未认证请求 MUST 返回 403 `AdminApiEnvelope`（`ok: false`、`reason: "unauthorized"`）。

#### Scenario: 已认证请求通过
- **WHEN** 请求携带有效 `admin_shadow` cookie
- **THEN** 端点正常处理并返回 200 + `AdminApiEnvelope`

#### Scenario: 未认证请求被拒
- **WHEN** 请求缺少或携带无效 admin cookie
- **THEN** 返回 403，body 为 `{ ok: false, degraded: true, reason: "unauthorized" }`

### Requirement: GET /api/admin/langfuse/traces

端点 SHALL 返回分页 trace 列表。支持查询参数：`q`（搜索关键词）、`model`、`status`、`lane`、`from`、`to`（日期范围）、`page`、`limit`。响应 MUST 为 `AdminApiEnvelope<{ traces: TraceListItem[], total: number, page: number, limit: number }>`。

#### Scenario: 正常分页查询
- **WHEN** `GET /api/admin/langfuse/traces?page=1&limit=20`
- **THEN** 返回 `ok: true`，`data.traces` 数组，`data.total` 为总数

#### Scenario: Langfuse 不可用
- **WHEN** Langfuse API 超时或不可达
- **THEN** 返回 `ok: false`、`degraded: true`、`reason: "langfuse_unavailable"`，HTTP 200

### Requirement: GET /api/admin/langfuse/traces/[traceId]

端点 SHALL 返回单 trace 详情，含 observation 嵌套树和 scores 列表。响应 MUST 为 `AdminApiEnvelope<TraceDetail>`。

#### Scenario: 获取有效 trace
- **WHEN** `GET /api/admin/langfuse/traces/valid-trace-id`
- **THEN** 返回 `ok: true`，`data.observations` 为嵌套树结构

#### Scenario: trace 不存在
- **WHEN** `GET /api/admin/langfuse/traces/nonexistent`
- **THEN** 返回 `ok: false`、`reason: "trace_not_found"`

### Requirement: GET /api/admin/langfuse/scores

端点 SHALL 返回 score 聚合统计。支持查询参数：`range`（`1d`/`7d`/`30d`）、`name`（可选，过滤特定 score）。响应 MUST 为 `AdminApiEnvelope<{ stats: ScoreStats[] }>`。

#### Scenario: 7 天趋势查询
- **WHEN** `GET /api/admin/langfuse/scores?range=7d`
- **THEN** 返回所有 score 的统计及 7 天内每日趋势

### Requirement: GET /api/admin/langfuse/observations

端点 SHALL 返回按模型与角色聚合的延迟/Token/成本分布数据。响应 MUST 为 `AdminApiEnvelope<{ models: ModelObservationStats[] }>`，其中 `ModelObservationStats` 含 `model`、`role`、`count`、`avgLatencyMs`、`totalTokens`、`totalCost`。

#### Scenario: 模型性能聚合
- **WHEN** `GET /api/admin/langfuse/observations`
- **THEN** 返回各模型的 p50/p95 延迟、成功率、平均 Token 等指标

### Requirement: GET /api/admin/langfuse/cost

端点 SHALL 返回按模型/角色/lane/日期的成本拆解。响应 MUST 为 `AdminApiEnvelope<{ costs: CostBreakdown[], dailyCostTrend: { date: string, cost: number }[] }>`。

#### Scenario: 成本拆解查询
- **WHEN** `GET /api/admin/langfuse/cost?range=30d`
- **THEN** 返回各模型+角色的成本分项及日成本趋势线

### Requirement: GET /api/admin/langfuse/health

端点 SHALL 返回 Langfuse 连接健康状态。无需查询参数。响应 MUST 为 `AdminApiEnvelope<{ connected: boolean, lastIngestionTime: string | null, exportErrorCount: number }>`。

#### Scenario: Langfuse 正常连接
- **WHEN** Langfuse API 可达且最近有数据写入
- **THEN** 返回 `connected: true`，`lastIngestionTime` 非空

#### Scenario: Langfuse 连接失败
- **WHEN** Langfuse API 不可达
- **THEN** 返回 `connected: false`、`degraded: true`，HTTP 200
