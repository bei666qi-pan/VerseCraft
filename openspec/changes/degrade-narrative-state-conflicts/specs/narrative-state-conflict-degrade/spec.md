## ADDED Requirements

### Requirement: Unsupported acquisition prose is conservatively degraded

When a candidate final narrative contains a strong acquisition assertion and the same turn has no authoritative `awarded_items` or `awarded_warehouse_items`, the system MUST, while the rollout flag is enabled, replace the assertion with a non-ownership observation or a conservative player-facing fallback. It MUST NOT invent an award or mutate inventory from narrative text.

#### Scenario: Pick-up assertion without award

- **WHEN** candidate narrative says the player “捡起了” an item and both award arrays are empty
- **THEN** final narrative MUST not retain that acquisition assertion, MUST retain empty award arrays, and MUST expose a bounded consistency flag

#### Scenario: Supported award remains intact

- **WHEN** candidate narrative contains acquisition language and the turn contains at least one authoritative award
- **THEN** the system MUST preserve the supported narrative and award delta

#### Scenario: Safety-blocked combat claim

- **WHEN** hard safety blocks a candidate combat outcome and strips its authoritative state delta
- **THEN** final narrative MUST not claim a hit, suppression, or weapon loss and MUST use a conservative no-state-change fallback

### Requirement: Conflict degrade is rollout-safe and post-generation

The system SHALL control the bounded degrade through `VERSECRAFT_ENABLE_NARRATIVE_STATE_CONFLICT_DEGRADE`. It MUST run only in the final consistency path and MUST NOT add model calls, database IO, or work before the first SSE status/text frame.

#### Scenario: Rollout disabled

- **WHEN** the conflict-degrade flag is disabled
- **THEN** the system MUST preserve existing shadow behavior and still retain available validation telemetry
