## Why

真实网关基准已复现：普通探索回合的最终正文可低至 102 字，低于该场景 180 字的可玩性下限；现有后置扩写在超时或候选不合规时会静默保留短文，因而质量 gate 无法区分“安全降级”与“可接受叙事”。现在需要使这类短正文成为可观测、可收敛的非通过结果，而不牺牲首字反馈或篡改结构化状态。

## What Changes

- 为可扩写的普通叙事建立与 `narrative_budget_packet` 对齐的最终长度验收与明确 telemetry。
- 仅在后置预算允许时尝试现有扩写；扩写未达到该预算的最低可玩长度时保留原文但记录不可通过原因，供 live benchmark 严格判定。
- 补充真实 gateway 回归，要求普通探索场景同时满足 SSE、状态、长度与 final 延迟边界。

## Capabilities

### New Capabilities

- `live-narrative-minimum-evidence`: 为最终玩家可见叙事提供与场景预算一致的长度证据与非通过诊断。

### Modified Capabilities

- 无。

## Impact

- 受影响：`/api/chat` final hooks、叙事扩写 telemetry 与 live chat benchmark。
- 不改变 SSE / DM JSON 契约、结构化状态、analytics 事件名、数据库 schema 或客户端存档；首 status 与流式首字仍先于后置扩写。
- 保留 `AI_NARRATIVE_EXPANSION_ENABLED` 与现有预算开关；预算耗尽或模型失败时安全输出原文，同时明确标记质量未达标，绝不使用模板补写冒充模型结果。
