## Purpose

以有界、可验证的后置扩写提高实时叙事质量，同时不影响主回合的首屏反馈与结构化状态。

## Requirements

### Requirement: Realistic bounded narrative expansion

当已生成回合满足既有扩写触发条件时，系统 SHALL 为后置 `NARRATIVE_EXPANSION` 提供能够容纳已验证正常网关响应的默认预算；该预算 MUST 仍受配置上限、总回合 p95 剩余预算和扩写 JSON/协议/结论校验约束，且 live benchmark MUST 继续检验聚合 p50/p95。

#### Scenario: 正常短叙事获得安全扩写

- **WHEN** short、standard、reveal 或 climax 回合的 narrative 低于明确最低长度，且剩余总回合预算充足
- **THEN** 系统 MUST 尝试后置扩写，并仅在候选通过既有校验后把扩写 narrative 写入最终回合

#### Scenario: 扩写超时或不可用

- **WHEN** 扩写请求超过可用预算、网关失败或候选未通过校验
- **THEN** 系统 MUST 保留主模型原 narrative，并继续输出可解析的 SSE final，且不得改变任何结构化状态

### Requirement: First-visible feedback remains independent of expansion

后置叙事扩写 SHALL NOT 阻塞 `/api/chat` 的首个 status frame 或首个可见主模型文本，且 MUST 保留现有关闭开关。

#### Scenario: 玩家在扩写进行时已收到主回合反馈

- **WHEN** 一个回合触发后置扩写
- **THEN** 系统 MUST 在扩写开始前已遵循既有 SSE status 与主模型流式反馈路径，并允许 `AI_NARRATIVE_EXPANSION_ENABLED=0` 停用该步骤
