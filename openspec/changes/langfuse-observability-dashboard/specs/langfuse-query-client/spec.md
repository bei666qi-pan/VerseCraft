## ADDED Requirements

### Requirement: 封装 Langfuse REST API 只读查询

系统 SHALL 在 `src/lib/observability/langfuse/queryClient.ts` 中提供对 `@langfuse/client` 的薄封装，暴露 trace 列表/详情、observations 列表、scores 与 metrics 查询函数。所有方法 MUST fail-open：超时或网络错误时返回空结果并标记 `degraded: true`，不得抛出异常。查询开关由 `VERSECRAFT_ENABLE_LANGFUSE_READ` 控制，超时由 `VERSECRAFT_LANGFUSE_READ_TIMEOUT_MS` 控制（默认 5000ms）。

#### Scenario: 正常查询 trace 列表
- **WHEN** `VERSECRAFT_ENABLE_LANGFUSE_READ=true` 且 Langfuse API 可达
- **THEN** `listTraces()` 返回分页的 `TraceListItem[]`，`degraded: false`

#### Scenario: Langfuse API 超时
- **WHEN** 查询耗时超过 `VERSECRAFT_LANGFUSE_READ_TIMEOUT_MS`
- **THEN** 返回空结果，`degraded: true`，不抛出异常

#### Scenario: 功能开关关闭
- **WHEN** `VERSECRAFT_ENABLE_LANGFUSE_READ=false`
- **THEN** 所有查询函数返回空结果，`degraded: true`，reason 为 `langfuse_read_disabled`

#### Scenario: Langfuse API 网络不可达
- **WHEN** `fetch` 抛出网络错误
- **THEN** 返回空结果，`degraded: true`，不抛出异常

### Requirement: 暴露类型安全的查询结果

查询客户端 SHALL 定义并导出以下类型，不直接暴露 `@langfuse/client` 的内部类型：

- `TraceListItem`：`id`、`name`、`userId`、`sessionId`、`timestamp`、`latency`、`totalTokens`、`totalCost`、`observationCount`、`scores`
- `TraceDetail`：继承 `TraceListItem`，新增 `observations: ObservationNode[]`、`scoreList: LangfuseScore[]`
- `ObservationNode`：`id`、`name`、`type`、`startTime`、`endTime`、`model`、`usage`、`inputCost`、`outputCost`、`parentObservationId`
- `ScoreStats`：`name`、`dataType`、`avg`、`min`、`max`、`p50`、`p95`、`count`、`trend: { date, avg }[]`

#### Scenario: 类型隔离
- **WHEN** 业务代码导入 `queryClient.ts` 的类型
- **THEN** 不依赖 `@langfuse/client` 的导出类型

### Requirement: 查询方法覆盖

查询客户端 SHALL 暴露以下方法：

- `listTraces(params)`：分页 trace 列表，支持 `q`（搜索）、`fromTimestamp`、`toTimestamp`、`limit`、`page` 参数
- `getTrace(traceId)`：单 trace 详情，含 observations 树和 scores
- `listObservations(params)`：按 traceId 或通用过滤的 observations 列表
- `listScores(params)`：scores 列表，支持 `name`、`fromTimestamp`、`toTimestamp` 过滤
- `getScoreStats(params)`：按 score name 聚合的统计（avg/min/max/p50/p95）+ 趋势数据
- `getMetricsDaily(params)`：每日 metrics 聚合

#### Scenario: getTrace 返回完整详情
- **WHEN** 传入有效的 `traceId`
- **THEN** 返回的 `TraceDetail` 包含 `observations` 嵌套树和 `scoreList` 数组

#### Scenario: getScoreStats 按 name 聚合
- **WHEN** 传入 `name="contract_valid"` 和时间范围
- **THEN** 返回该 score 的 avg/min/max/p50/p95 值及趋势数组
