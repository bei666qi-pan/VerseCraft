## ADDED Requirements

### Requirement: A single typed Director workflow SHALL serve both worlds
The worker SHALL execute one fixed typed workflow for Dark Moon and Xingni in the order: recover run, load scoped context, validate pacing signals, select actors, optionally project actors, call one Director reasoner, normalize, validate, enforce, capability-filter, optionally criticize, transactionally commit, and expose an applicable hint. The system MUST NOT retain a LangGraph or alternate orchestration branch.

#### Scenario: Dark Moon tick
- **WHEN** a valid Dark Moon V2 tick is claimed
- **THEN** the worker executes the shared workflow with the Dark Moon capability profile

#### Scenario: Xingni tick
- **WHEN** a valid Xingni Qingshi V2 tick is claimed
- **THEN** the worker executes the same workflow with the Xingni capability profile

### Requirement: World capability profiles SHALL prevent cross-world invention and leakage
The workflow SHALL validate all fact, NPC, location, event, task, and action references against the exact world/map capability profile. Xingni MUST be limited to registered Qingshi content and MUST NOT create rewards, realms, enemies, quest settlement, or new facts.

#### Scenario: Xingni candidate references Dark Moon NPC
- **WHEN** a Xingni Director candidate references an NPC registered only in Dark Moon
- **THEN** the capability validator rejects that reference and it cannot enter persistence or a Writer hint

#### Scenario: Xingni candidate invents progression reward
- **WHEN** a Xingni Director candidate proposes an unregistered reward or realm change
- **THEN** the capability validator rejects the proposal before commit

### Requirement: Deterministic acceptance order SHALL dominate model output
The workflow MUST apply `schema normalization → validateDirectorPlan → enforceDirectorPlan → world capability validation` in order. A critic, when required, SHALL be strictly subtractive and MUST NOT restore any rejected item.

#### Scenario: Critic approves deterministically rejected event
- **WHEN** the critic returns an event removed by an earlier deterministic gate
- **THEN** the workflow keeps the event rejected

### Requirement: Director failures SHALL fail open outside the current-turn path
Actor, critic, tool, database-read, or Director failures MUST NOT change or delay the committed current player turn. Actor failure SHALL still permit the single Director call; Director failure SHALL produce no new hint.

#### Scenario: Actor batch times out
- **WHEN** Actor Simulation exceeds its background budget
- **THEN** the workflow calls the Director without Actor projections and the current player turn remains complete

#### Scenario: Director reasoner fails
- **WHEN** the Director reasoner cannot produce a valid candidate
- **THEN** no new plan, agenda mutation, or hint envelope is committed
