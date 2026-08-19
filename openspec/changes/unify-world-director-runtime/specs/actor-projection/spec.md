## ADDED Requirements

### Requirement: Actor Projection SHALL use one bounded batch call
When Actor Simulation is `batch_soft`, each tick SHALL select at most three important NPCs and make no more than one batch LLM call with a maximum 2,048-token and 30-second total budget. The system MUST NOT fan out autonomous or parallel NPC agents.

#### Scenario: More than three NPCs are eligible
- **WHEN** cast selection receives more than three eligible NPCs
- **THEN** it deterministically selects at most three and sends one batch request

#### Scenario: Actor Simulation is disabled
- **WHEN** the Actor kill switch is off
- **THEN** the tick skips Actor Projection and continues to the single Director

### Requirement: Actor contexts SHALL be world- and actor-scoped
Dark Moon Actor contexts SHALL contain only allowed world-scoped NPC state, relations, and epistemic facts. Xingni Actor contexts SHALL contain only registered Qingshi content, schedules, present NPC IDs, normalized Xingni state, and knowledge allowed to that actor.

#### Scenario: Private fact belongs to another NPC
- **WHEN** an actor context is built and a fact is private to a different NPC
- **THEN** that fact is excluded from the batch input

#### Scenario: Xingni actor references unregistered location
- **WHEN** a Xingni projection references a location outside the Qingshi profile
- **THEN** the projection is rejected before Director synthesis

### Requirement: Insufficient actor evidence SHALL produce blocked projections
Projections SHALL reference only allowed fact, NPC, location, and action codes. When evidence is insufficient, the projection MUST be marked blocked and MUST NOT invent a fact or action.

#### Scenario: Actor has no knowledge supporting an action
- **WHEN** the model proposes an action whose required fact is absent from the actor context
- **THEN** validation converts or rejects it as blocked and excludes it from Director evidence

### Requirement: Client pacing signals SHALL be deterministic and untrusted
The persisted `storyDirector` key SHALL remain compatible, while its runtime responsibility SHALL be limited to bounded numeric, enum, and ID pacing/chapter signals. The server MUST revalidate all values and references before using them in an Actor or Director context.

#### Scenario: Legacy storyDirector state is loaded
- **WHEN** an existing save contains the legacy persisted key
- **THEN** migration preserves it and exposes equivalent deterministic Pacing & Chapter Controller state

#### Scenario: Client sends out-of-range tension
- **WHEN** a tick contains a tension value outside the allowed range
- **THEN** the worker clamps or rejects it according to deterministic validation before context assembly
