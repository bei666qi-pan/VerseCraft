## ADDED Requirements

### Requirement: AI usage ledger supplements existing analytics contracts
The system SHALL use the dedicated AI usage ledger for cross-task AI cost views while continuing to emit and aggregate existing append-only analytics events and compatibility payload keys.

#### Scenario: Player chat completes after the usage ledger is enabled
- **WHEN** a player turn emits `chat_request_finished` and records one or more upstream AI attempts
- **THEN** existing player/activity aggregates retain their established values and the AI management view obtains its cross-task breakdown from the usage ledger without double-counting

