# Tasks: add-bounded-director-actor-simulation

## Phase 3: Background Actor Simulation (Narrative Chain Consolidation)

### Type System

- [x] **T1: Define Actor Simulation types**
  - `DirectorCastPlan`, `DirectorCastActor`, `CastSelectionReasonCode`
  - `ActorSimulationInput`, `ActorRelationEdge`, `EpistemicFactSummary`
  - `ActorProjection`, `ActorCandidateAction`, `PlayerAgencyConstraint`
  - `ActorProjectionIssue`, `ActorProjectionIssueCode`
  - `DirectorSynthesisInput`, `ActorSimulationTelemetry`, `ActorSimulationFlags`
  - File: `src/lib/worldEngine/actorSimulation/types.ts` (246 lines)

### Deterministic Layer

- [x] **T2: Implement Cast Selection**
  - Pure function reusing `selectActiveNpcsForSocialTick()`
  - Default max 3 NPCs, deterministic scoring
  - Supports scene/mentioned/state-change priority
  - File: `src/lib/worldEngine/actorSimulation/castSelection.ts`

- [x] **T3: Implement Actor Input Builder**
  - Per-NPC epistemic filtering
  - Scene public + actor-scoped fact separation
  - Forbidden fact exclusion
  - File: `src/lib/worldEngine/actorSimulation/buildActorInput.ts`

- [x] **T4: Implement Projection Validator**
  - 10 checks: unregistered NPC, forbidden fact, dmOnly leak, location, forced player action/failure, rumor-as-fact, missing source, reveal tier breach, must-not-reveal
  - Pure function, no IO
  - 10 tests, 0 failures
  - File: `src/lib/worldEngine/actorSimulation/validateProjection.ts`

- [x] **T5: Implement Feature Flag Config**
  - `VERSECRAFT_ENABLE_ACTOR_SIMULATION` (default false)
  - Mode switch: off / batch_shadow / batch_soft
  - Budget control: maxActors, horizonTurns, tickBudget, perActorTimeout
  - File: `src/lib/worldEngine/actorSimulation/config.ts`

### LLM Call Layer (NEW)

- [x] **T6: Implement Bounded Actor Simulator**
  - Builds actor-scoped prompts per RUNTIME-PROMPTS.md template
  - Batch STORYLINE_SIMULATION call via `runOfflineReasonerTask`
  - Parses + validates each projection via `validateActorProjection`
  - Shadow mode: no LLM call, returns empty projections
  - Budget: total tick budget, per-actor timeout, max tokens
  - File: `src/lib/worldEngine/actorSimulation/actorSimulator.ts` (360 lines)

- [x] **T7: Implement Director Synthesizer**
  - Pure function, no IO
  - Conflict detection: location, target, duplicate, knowledge asymmetry
  - Safety filtering: unregistered NPC/target, must-not-reveal, agency demotion
  - Output: safeCandidateActions, injection hint, summary
  - 11 tests, 0 failures
  - File: `src/lib/worldEngine/actorSimulation/directorSynthesizer.ts` (340 lines)

### World Engine Integration

- [x] **T8: Wire into World Engine Tick**
  - `runActorSimulationPhase` now async, calls LLM in soft mode
  - Shadow mode: deterministic context hints only
  - Telemetry recording
  - Files: `integration.ts`, `engine.ts`

- [x] **T9: Module Index**
  - Exports all public types and functions
  - File: `index.ts`

### Tests

- [x] **T10: validateProjection tests** — 10 tests, 0 failures
- [x] **T11: actorSimulator tests** — 19 tests (prompt, parsing, telemetry), 0 failures
- [x] **T12: directorSynthesizer tests** — 11 tests (conflicts, filtering, hints), 0 failures

### Verification

- [x] **T13: TypeScript compiles cleanly** — 0 errors in actorSimulation/*
- [x] **T14: ESLint clean** — 0 errors, 0 warnings in actorSimulation/*
- [x] **T15: Unit test suite** — 40 tests, 0 failures

## Remaining (Future Work)

- [ ] Live gateway simulation test (requires AI gateway credentials)
- [ ] Parallel fan-out mode (separate feature flag)
- [ ] Golden scene fixtures for director eval
- [ ] Database persistence for telemetry
