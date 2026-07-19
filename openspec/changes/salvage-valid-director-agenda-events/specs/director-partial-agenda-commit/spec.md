## ADDED Requirements

### Requirement: Independent valid agenda events survive sibling rejection

当 DirectorPlan 本身通过 schema、总体风险和 private-hook 校验时，系统 MUST 独立验证每个 agenda event。单个 event 的高严重度问题 MUST 仅拒绝该 event，并让其他通过全部 event-level hard checks 的事件进入 agenda 写入候选。

#### Scenario: 混合有效与无效事件

- **WHEN** 一个低或中风险环境提示完整合规，而同一计划中的另一高风险事件缺少 agency 或 forbidden outcome 约束
- **THEN** 系统 MUST 拒绝缺字段事件、保留合规事件的 accepted code，并允许 worker 持久化合规 agenda

#### Scenario: 计划级风险

- **WHEN** DirectorPlan schema 无效、总体 agency/spoiler/safety risk 为 high，或 private hook 缺少不可直出契约
- **THEN** 系统 MUST 拒绝全部 agenda 与 social events

### Requirement: Rejection remains auditable

系统 SHALL 在既有 validation 输出中保留所有 rejected event code 和 issue；只提交 accepted code 对应事件。

#### Scenario: 事后排查混合计划

- **WHEN** worker 持久化包含被拒绝 sibling 的计划
- **THEN** `world_engine_runs.output_json.validation` MUST 同时列出被接受与被拒绝 event code 以及问题原因
