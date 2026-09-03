## Purpose

在不影响流式首屏反馈的前提下，给真实网关的最终修复留出有界且可审计的时间预算。修复仅能处理已裁决文本，不得增加工具调用、新事实或第二条提交链。

## Requirements

### Requirement: Malformed-DM repair uses a gateway-realistic bounded final budget

When streamed player DM is malformed or resolved facts require narrative-only consistency repair, the system MUST allow at most one repair attempt within the shared final deadline derived from the chat latency budget. The repair request MUST remain within the existing operational clamp and MUST receive only resolved facts needed to repair player-visible text. These budgets MUST apply after generation and MUST NOT delay first SSE status or first model text.

#### Scenario: Repair has sufficient shared budget

- **WHEN** the main stream is malformed or narrative contradicts a grounded resolved result and sufficient shared final budget remains
- **THEN** one repair MAY run within the configured bounded repair budget and the normal-turn final p95 deadline

#### Scenario: Default budget supports repair beyond prior two-second window

- **WHEN** no `VC_FINAL_REPAIR_BUDGET_MS` override is configured and the main stream is malformed
- **THEN** the malformed-DM repair call MUST receive 4,000 ms when that much shared final-repair budget remains, and the shared window MUST be no more than 12,000 ms

#### Scenario: Operator override stays bounded

- **WHEN** `VC_FINAL_REPAIR_BUDGET_MS` is set outside the accepted operational bounds
- **THEN** the repair budget MUST be clamped and MUST NOT extend the shared final deadline

#### Scenario: Unknown entity hard block can be repaired safely

- **WHEN** an entity hard block is not caused by prompt injection
- **THEN** the system MUST attempt no more than one bounded narrative-only repair and re-run the same safety audit; state writes remain blocked unless the repaired output passes

#### Scenario: Repair cannot finish in time

- **WHEN** no safe repair budget remains or the repair fails
- **THEN** the system MUST retain deterministic state and emit an audited, protocol-valid safe fallback without inferring state from prose
