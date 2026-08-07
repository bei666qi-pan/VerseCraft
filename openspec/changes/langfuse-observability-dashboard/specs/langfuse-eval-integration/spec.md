## ADDED Requirements

### Requirement: Scenario 到 Langfuse Dataset 映射

系统 SHALL 在 `src/lib/evals/selfImprove/langfuseDataset.ts` 中提供将 `SelfImproveScenario[]` 创建或更新为 Langfuse dataset 的能力。每个 scenario 生成一个 dataset item，其中 `input` 为 `playerInput`，`expectedOutput` 为 `expectedBehavior`（取第一个 invariant 的 `expected` 值或完整 invariant 列表的 JSON）。此功能 MUST 由 `VERSECRAFT_LANGFUSE_EVAL_ENABLED` 控制。

#### Scenario: 创建 dataset
- **WHEN** `VERSECRAFT_LANGFUSE_EVAL_ENABLED=true` 且传入 scenario 数组
- **THEN** 在 Langfuse 中创建或更新 dataset，每个 scenario 映射一个 item

#### Scenario: 功能开关关闭
- **WHEN** `VERSECRAFT_LANGFUSE_EVAL_ENABLED=false`
- **THEN** 不调用 Langfuse API，静默跳过

### Requirement: Langfuse Experiment 运行

系统 SHALL 在 `src/lib/evals/selfImprove/langfuseExperiment.ts` 中提供在 dataset 上运行 experiment 的能力：关联 trace→dataset-run-item，上传 judge 评分。

#### Scenario: Experiment 运行
- **WHEN** 在有效 dataset 上启动 experiment
- **THEN** 每个 trace 关联到对应的 dataset run item，judge 评分上传为 experiment scores

### Requirement: Trace 上传到 Langfuse

系统 SHALL 在 `src/lib/evals/selfImprove/langfuseTraceUpload.ts` 中提供将 `SelfImproveTrace` 通过 Langfuse REST API 批量上传的能力。上传 MUST 支持去重（通过 `traceId` 判断）和分批（每批不超过 50 条）。上传失败 MUST 静默记录日志，不阻塞 eval 主流程。

#### Scenario: 批量上传
- **WHEN** 调用 `uploadTracesToLangfuse(traces)`
- **THEN** 按 50 条一批上传，已存在的 trace 自动跳过

#### Scenario: 上传失败不阻塞
- **WHEN** Langfuse API 不可用
- **THEN** 记录错误日志，继续 eval 主流程，不抛出异常

### Requirement: Orchestrator 新增 Langfuse 上传步骤

`orchestrator.ts` 的 `runSelfImprovement` SHALL 在 game execution 完成后、judging 之前，异步上传 trace 到 Langfuse。上传由 `--langfuse` CLI 标志控制。

#### Scenario: --langfuse 标志启用
- **WHEN** CLI 传入 `--langfuse` 标志
- **THEN** 每轮 game execution 完成后，trace 异步上传到 Langfuse

#### Scenario: --langfuse 标志未启用
- **WHEN** CLI 未传入 `--langfuse` 标志
- **THEN** trace 仅写入本地 JSONL，不上传 Langfuse（现有行为不变）

### Requirement: CLI 脚本新增 Langfuse 变体

`package.json` SHALL 新增 `self-improve:run:langfuse`、`self-improve:dry-run:langfuse`、`self-improve:campaign:langfuse` 脚本，底层调用对应脚本并传入 `--langfuse` 标志。

#### Scenario: 运行 Langfuse 变体
- **WHEN** 执行 `pnpm self-improve:run:langfuse`
- **THEN** 等效于 `tsx --conditions=react-server scripts/self-improve/run.ts --langfuse`

### Requirement: SelfImproveTrace 类型扩展

`SelfImproveTrace` 接口 SHALL 新增可选字段 `langfuseTraceId?: string` 和 `langfuseObservationId?: string`，用于记录上传后的 Langfuse 标识。

#### Scenario: 类型兼容
- **WHEN** 旧 JSONL 文件中 trace 不含 `langfuseTraceId` 字段
- **THEN** `readTraces()` 正常解析，`langfuseTraceId` 为 `undefined`

### Requirement: 本地 JSONL 存储保留

本地 JSONL trace 存储（`traceStore.ts`）SHALL 保持功能不变，作为 Langfuse 不可用时的 fallback。`--langfuse` 标志启用时，trace 同时写入本地 JSONL 和上传 Langfuse（双写）。

#### Scenario: 双写模式
- **WHEN** `--langfuse` 启用且 Langfuse 可用
- **THEN** trace 同时出现在本地 JSONL 和 Langfuse 中

#### Scenario: Langfuse 不可用时 fallback
- **WHEN** `--langfuse` 启用但 Langfuse API 不可达
- **THEN** trace 仅写入本地 JSONL，上传步骤静默失败不阻塞
