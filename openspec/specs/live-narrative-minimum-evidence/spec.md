## Purpose

确保实时叙事质量门禁以回合编译器的权威长度预算为准，并保留玩家的首屏等待体验。所有质量结论都必须由最终可见文本产生，不允许以中间候选或缺失样本冒充通过。

## Requirements

### Requirement: Final narrative minimum evidence

For a non-safety, non-death, non-system player turn with a narrative budget, the system SHALL record whether the final player-visible narrative meets that budget's `minChars`; an expansion failure or exhausted budget MUST remain a non-pass quality outcome rather than an implicit pass.

#### Scenario: Standard exploration is shorter than its budget

- **WHEN** the resolved final narrative is below the standard budget minimum after all allowed post-generation work
- **THEN** the final evidence MUST identify the shortfall and a strict live quality gate MUST fail that run while preserving the parseable final and structured state

#### Scenario: Expansion reaches the budget safely

- **WHEN** a post-generation expansion candidate passes existing protocol and conclusion guards and reaches the applicable minimum
- **THEN** the system MUST use that narrative as the final visible narrative without changing non-narrative fields

#### Scenario: Short turn is below its explicit minimum

- **WHEN** a non-safety short turn is below its authoritative `minChars`
- **THEN** it MUST be eligible for the same constrained narrative-only expansion; if that expansion cannot reach the minimum, the strict live quality gate MUST fail rather than lowering the threshold

#### Scenario: Benchmark checks the authoritative minimum

- **WHEN** a live benchmark evaluates a fixture
- **THEN** its length gate MUST reuse the turn compiler's narrative-budget resolver and report that resolved minimum, rather than treating a fixture's historical documentation value as an independent policy

### Requirement: Narrative minimum evidence preserves perceived latency

The system SHALL keep narrative-minimum evaluation and optional expansion out of the status and first-token path.

#### Scenario: A turn requires expansion

- **WHEN** a live player turn triggers a post-generation expansion
- **THEN** its status and first visible model text MUST follow the existing SSE path before the expansion attempt
