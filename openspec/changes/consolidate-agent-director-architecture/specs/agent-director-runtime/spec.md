# Agent and Director Runtime

## ADDED Requirements

### Requirement: One authoritative Player Turn workflow

Every narrative or mechanics candidate SHALL pass through the same Turn Engine finalization and SHALL emit exactly one authoritative FINAL envelope.

#### Scenario: Narrative and mechanics lanes converge
- **WHEN** either lane produces a non-authoritative turn candidate
- **THEN** the single Turn Finalizer validates, commits, emits one FINAL, and queues post-turn work

### Requirement: Bounded mechanics execution

Mechanics execution SHALL be world-scoped, idempotent, limited to two model invocations and one state-changing command, and SHALL NOT fall back to a third full Writer invocation.

#### Scenario: Mechanics model does not request a tool
- **WHEN** the first mechanics response contains no tool request
- **THEN** that response becomes the candidate without a Writer fallback or a third model invocation

### Requirement: One asynchronous Director invocation

An eligible World Director tick SHALL execute after the committed Player Turn, SHALL use at most one model invocation, and SHALL fail open without changing the current turn.

#### Scenario: Multiple triggers target one committed turn
- **WHEN** several post-turn triggers refer to the same world, map, session, and turn
- **THEN** the queue contains one Director job and the workflow performs at most one model invocation

### Requirement: Single event agenda authority

Future event lifecycle SHALL be owned by the server event agenda. Client chapter pacing SHALL NOT schedule or commit world events.

#### Scenario: Legacy save contains client Director fields
- **WHEN** a save contains `storyDirector` or `incidentQueue`
- **THEN** loading migrates pacing state while subsequent saves omit both legacy fields

### Requirement: Measured budgets

AI usage SHALL be correlated to the request or Director run and SHALL use provider usage or a marked estimate; zero or character-only values SHALL NOT be treated as cost evidence.

#### Scenario: Provider omits token usage
- **WHEN** an invocation succeeds without provider token counts
- **THEN** observability marks usage as estimated and does not present a zero or character count as measured cost
