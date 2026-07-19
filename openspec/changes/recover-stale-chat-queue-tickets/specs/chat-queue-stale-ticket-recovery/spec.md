## ADDED Requirements

### Requirement: Stale queue ticket recovery
The play client SHALL recover a pending action once when an action carrying a queue ticket receives a recognized stale-ticket rejection before any SSE content is accepted.

#### Scenario: Ticket becomes terminal before execution claim
- **WHEN** a pending action carrying a queue ticket, whether restored or newly admitted, receives HTTP 409 with a recognized missing or terminal ticket reason
- **THEN** the client MUST clear the persisted ticket and request one fresh queue admission for the same action

#### Scenario: Fresh admission succeeds
- **WHEN** the one fresh queue admission succeeds
- **THEN** the client MUST execute the action through the normal queue and `/api/chat` path without duplicating the player log entry

#### Scenario: Non-ticket error is not retried
- **WHEN** `/api/chat` returns an unknown 409, model error, or failure after SSE content has begun
- **THEN** the client MUST preserve the existing failure behavior and MUST NOT retry the action

#### Scenario: Recovery is exhausted
- **WHEN** the fresh admission or its execution fails
- **THEN** the client MUST show the existing visible failure behavior and leave no persisted stale queue ticket
