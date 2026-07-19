## ADDED Requirements

### Requirement: Malformed-DM repair uses a gateway-realistic bounded final budget

When the streamed player DM cannot be parsed, the system MUST allow the final repair path a bounded 4,000 ms request within a shared 6,000 ms final-repair window, clamped by the existing 1,000–12,000 ms operational bounds. The same shared window MAY be used by post-validator narrative repair. These budgets MUST only apply after generation and MUST NOT delay first SSE status or first model text.

#### Scenario: Default budget supports repair beyond prior two-second window
- **WHEN** no `VC_FINAL_REPAIR_BUDGET_MS` override is configured and the main stream is malformed
- **THEN** the malformed-DM repair call MUST receive 4,000 ms when that much shared final-repair budget remains, and the shared window MUST be no more than 12,000 ms

#### Scenario: Operator override stays bounded
- **WHEN** `VC_FINAL_REPAIR_BUDGET_MS` is set below 1,000 or above 12,000
- **THEN** the repair budget MUST be clamped to the existing lower or upper bound

#### Scenario: Unknown entity hard block can be repaired safely
- **WHEN** an entity hard block is not caused by prompt injection
- **THEN** the system MUST attempt one bounded narrative-only repair and re-run the same safety audit; state writes remain blocked unless the repaired output passes, and a failed repair MUST retain deterministic safety fallback
