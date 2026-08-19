# Authoritative Turn Consistency

## Purpose

确保回合权威状态只来自已验证的结构化候选、注册事实与确定性机制，并让玩家可见正文在共享延迟预算内与裁决事实保持一致。

## Requirements

### Requirement: Narrative must never be an authoritative state source

The turn engine MUST derive authoritative state only from validated structured candidate fields, authoritative current state, registered world facts, and deterministic mechanics. It MUST NOT infer or write location, conflict, damage, sanity, death, NPC, item, task, or foreshadow state from narrative prose.

#### Scenario: Prose claims movement without a legal movement delta

- **WHEN** narrative says the player entered another room but no unique registered adjacent movement is established from the player action and current state
- **THEN** authoritative player location MUST remain unchanged

#### Scenario: Prose contains injury language

- **WHEN** narrative contains fighting, injury, panic, or collapse language without validated structured or deterministic mechanics evidence
- **THEN** the engine MUST NOT create conflict, damage, sanity, or death state

#### Scenario: Prose only mentions another floor as atmosphere

- **WHEN** narrative reports a light, sound, or other environmental observation from upstairs or downstairs without claiming completed player movement
- **THEN** the consistency guard MUST preserve the observation and MUST NOT treat it as cross-floor travel

### Requirement: Final narrative must agree with adjudicated facts

After adjudication, the system MUST validate narrative, options, location, death, items, and NPC references against the resolved turn. A detected contradiction MAY change or degrade player-visible text but MUST NOT change the resolved state.

#### Scenario: Narrative denies a grounded consequence

- **WHEN** a validated mechanic commits a player-visible consequence but candidate narrative omits or denies it
- **THEN** the system MUST perform at most one bounded narrative-only repair or use an audited safe fallback
- **AND** the repair output MUST NOT modify structured state

#### Scenario: Repair deadline expires

- **WHEN** the shared final deadline has insufficient remaining time or the repair fails validation
- **THEN** the system MUST emit a parseable deterministic final frame consistent with resolved state

### Requirement: Realtime contracts and latency remain bounded

Consistency enforcement MUST preserve the existing SSE media type, status frame, authoritative final frame, and required DM fields. Optional repair and final hooks MUST use the shared chat latency budget and MUST NOT delay first status or first visible text.

#### Scenario: Optional work exceeds remaining budget

- **WHEN** optional validation repair, analytics, or background enqueue cannot complete within the remaining final budget
- **THEN** it MUST be skipped, bounded, or deferred while a parseable final frame is emitted within the runtime deadline
