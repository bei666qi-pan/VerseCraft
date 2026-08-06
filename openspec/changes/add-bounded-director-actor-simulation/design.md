# Design: add-bounded-director-actor-simulation

## Architecture

```
WORLD_ENGINE_TICK (background worker, not /api/chat)
  → load current world/social/director state
  → deterministic cast selection (pure function, reuses selectActiveNpcsForSocialTick)
  → build actor-scoped simulation inputs (epistemic filtering per NPC)
  → [soft mode] bounded actor simulation (single batch STORYLINE_SIMULATION LLM call)
  → validate each ActorProjection (pure function, 10 checks)
  → director synthesis (conflict resolution, safety filtering, hint building)
  → inject synthesis context into reasoner prompt
  → existing parseWorldEngineDeltaJson → validateDirectorPlan → persistence
```

## Key Design Decisions

1. **Batch over Parallel**: Single batch LLM call per tick, not independent fan-out. Lower cost, better consistency, simpler error handling. Parallel fan-out is future work under separate flag.

2. **Pure Validators**: `validateActorProjection` and `synthesizeDirectorPlan` are pure functions. No IO, no DB, no LLM. All external state passed as structured parameters.

3. **Shadow-to-Soft Graduation**: `batch_shadow` mode runs cast selection + input building without LLM calls. `batch_soft` mode runs the full pipeline. Independent feature flags.

4. **Actor-Scoped Epistemic Filtering**: Each NPC can only access its `knownFactIds`, `actorScopedFacts`, and `scenePublicFacts`. `dmOnly` facts, other NPCs' private memories, and forbidden facts are excluded.

5. **Fail-Open**: Actor simulation failures (LLM errors, timeouts, validation failures) do not block the world tick. The reasoner still runs with or without actor simulation context.

## Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `types.ts` | All TypeScript type definitions |
| `config.ts` | Feature flags, budget, mode resolution |
| `castSelection.ts` | Deterministic NPC selection (pure function) |
| `buildActorInput.ts` | Build per-NPC simulation input with epistemic filtering |
| `validateProjection.ts` | Post-generation validator (pure function, 10 checks) |
| `actorSimulator.ts` | LLM call layer: prompt building, batch STORYLINE_SIMULATION, response parsing |
| `directorSynthesizer.ts` | Conflict resolution, safety filtering, hint building (pure function) |
| `integration.ts` | Async adapter connecting all layers to world engine |
| `index.ts` | Public API surface re-exports |

## Prompt Design

Actor simulation prompt follows `docs/prompts/narrative-chain-consolidation/RUNTIME-PROMPTS.md` Actor Simulator template:
- System prompt enforces cognitive discipline (no cross-NPC memory, no dmOnly facts)
- Each NPC gets an isolated prompt section with its scoped facts
- Output format: JSON with `projections[]` array
- Each projection includes: npcId, intent, candidateActions, mustNotRevealIds, blockedReason

## Budget

| Parameter | Default | Max |
|-----------|---------|-----|
| maxActors | 3 | 5 |
| horizonTurns | 2 | 3 |
| totalTickBudgetMs | 30,000 | 60,000 |
| perActorTimeoutMs | 10,000 | 20,000 |
| maxActionsPerActor | 3 | 5 |
| maxTokens | 2048 | 4096 |

## Feature Flags

- `VERSECRAFT_ENABLE_ACTOR_SIMULATION` (default: false)
- `VERSECRAFT_ACTOR_SIMULATION_MODE` (default: batch_shadow)
- `VERSECRAFT_ACTOR_SIMULATION_MAX_ACTORS`
- `VERSECRAFT_ACTOR_SIMULATION_HORIZON_TURNS`
- `VERSECRAFT_ACTOR_SIMULATION_TICK_BUDGET_MS`
- `VERSECRAFT_ACTOR_SIMULATION_PER_ACTOR_TIMEOUT_MS`

Flag off → original world director path unchanged.
