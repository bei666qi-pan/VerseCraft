# Test Integrity Gate

## Purpose

确保 playthrough 与 narrative eval 的通过结论只来自完整、可评分、来源明确的证据。

## ADDED Requirements

### Requirement: 测评运行必须先分类证据状态

系统 MUST 将运行分类为 `pass`、`fail`、`inconclusive` 或 `infrastructure_failure`。零步骤、执行错误、SSE 不完整、缺少 DM 必需字段或降级响应 MUST NOT 产生 judge 分数。

#### Scenario: 零步骤错误运行
- **WHEN** SUT 在任何有效回合前失败
- **THEN** 状态 MUST 为 `inconclusive` 或 `infrastructure_failure`
- **AND** `judgeResult` MUST 为 null

#### Scenario: 降级终帧
- **WHEN** 终帧来自 keys-missing、site failure、timeout 或其他基础设施降级
- **THEN** 该运行 MUST NOT 被归类为正常剧情 fail 或 pass

### Requirement: Live 汇总必须验证 provenance

只有完成的 `live_full` SUT 运行且 judge 来源为真实 `live` 时，结果 MAY 进入 live 通过率和分数均值。mock 或 offline heuristic MUST NOT 进入 live 分母。

#### Scenario: Mock judge 给出高分
- **WHEN** mock judge 对 transcript 给出通过或 5 分
- **THEN** 报告 MUST 标注 mock provenance
- **AND** 该结果 MUST NOT 增加 live pass count 或 live average

### Requirement: 报告不得为不可判定证据虚构分数

报告 MUST 对不可评分结果显示证据状态和原因，不显示总分、维度分或“无问题”结论。

#### Scenario: Judge result 为空
- **WHEN** `judgeResult` 为 null
- **THEN** renderer MUST 输出“未评分”及原因
- **AND** MUST NOT 输出数值评分或通过结论

### Requirement: 深度测评覆盖必须显式完整

deep/holdout 场景集合 MUST 显式覆盖战斗、任务、死亡门、伏笔生命周期、NPC 记忆、职业经济、边界、社交和多世界隔离，不得因默认数量截断而静默遗漏。

#### Scenario: 必需场景缺失
- **WHEN** deep profile 的场景清单缺少任一必需能力
- **THEN** runner MUST 在执行前失败并列出缺失能力

### Requirement: 生成型评测产物必须隔离并门控清理

新运行 MUST 默认写入 `.runtime-data/eval/<run-id>`。清理命令 MUST 默认 dry-run，只删除 manifest 明确列出的生成型 trace/report，并保留 fixtures、benchmark history、OpenSpec、手写文档和非报告运行状态。

#### Scenario: 终轮尚未成功
- **WHEN** 用户请求正式删除但未提供 terminal-success 门槛
- **THEN** 清理器 MUST 拒绝删除并只列出候选

#### Scenario: 终轮成功
- **WHEN** 确定性门禁、live smoke 和 deep/holdout 终轮均成功
- **THEN** 清理器 MAY 删除 manifest 匹配的生成型产物
- **AND** 清理后 MUST 验证无残留且无 durable-doc 死链

#### Scenario: Package eval command produces a report
- **WHEN** a package-level eval, benchmark, playtest, or test-gate command writes a generated report
- **THEN** the report MUST be placed under an isolated `.runtime-data/eval/<run-id-or-suite>/` directory
- **AND** the generator MUST NOT write or overwrite durable `docs/eval` documentation

#### Scenario: Historical root-level eval reports are cleaned
- **WHEN** the manifest lists a known historical eval or benchmark report in the `.runtime-data` root
- **THEN** terminal-success cleanup MAY delete that explicit report pattern
- **AND** non-report runtime state such as budget state MUST remain outside the deletion set
