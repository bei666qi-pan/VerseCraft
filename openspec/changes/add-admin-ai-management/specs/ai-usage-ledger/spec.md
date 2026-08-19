## ADDED Requirements

### Requirement: All upstream AI attempts produce a privacy-safe usage record
The system SHALL record final generation and embedding attempts with purpose, service/model snapshots, input/output/cached/total Token counts, latency, outcome, estimate status, and an idempotency key. It MUST NOT store prompt text, player input, narrative, API keys, or raw provider responses.

#### Scenario: Provider returns authoritative usage
- **WHEN** a generation succeeds with provider Token usage
- **THEN** the system asynchronously persists those counts once without delaying the player-visible stream

#### Scenario: Provider omits usage
- **WHEN** an upstream response has no usage fields
- **THEN** the system stores a clearly marked estimate and the admin UI labels it as estimated

### Requirement: RMB cost uses model price snapshots
The system SHALL calculate estimated RMB cost from the input/output price configured at call time. Missing prices MUST produce a null amount rather than a fabricated value.

#### Scenario: Model price is not configured
- **WHEN** a model call records Token usage but either required price is absent
- **THEN** the dashboard shows Token usage and no currency amount for that call or aggregate

### Requirement: Usage detail retention preserves durable aggregates
The system SHALL retain call-level detail for 90 days and SHALL upsert daily aggregates before deleting expired detail. Daily totals SHALL remain available after detail deletion.

#### Scenario: Retention cleanup runs
- **WHEN** usage events are older than 90 days
- **THEN** their daily service/model/purpose totals are committed idempotently before the detail rows are deleted

