## Context

The current World Director is an asynchronous PostgreSQL worker, but the repository also contains a partial LangGraph branch, session-only persistence queries, non-authoritative Redis deduplication, and queue code that can swallow database insertion failures. Actor Simulation exists as a bounded batch concept but is only partially integrated. Xingni support is arriving through user-owned uncommitted changes and must be incorporated without erasing them.

The online path remains fixed: `/api/chat` produces a candidate, deterministic Turn Engine code commits the current turn, the SSE authoritative final is emitted, and only then is a world tick enqueued. Director output may guide a later Writer turn but cannot mutate the current turn or become a second source of narrative truth.

## Goals / Non-Goals

**Goals:**

- Replace all Director orchestration variants with one typed staged workflow.
- Make every job, run, persistence query, hint, and Actor Projection explicitly world/map scoped.
- Make enqueue and retry behavior truthful and database-authoritative.
- Commit only sanitized hints derived from deterministically accepted candidates.
- Run one bounded Actor Simulation batch for at most three actors before one Director reasoner call.
- Preserve current SSE, final JSON, Turn Engine, storage compatibility, and online latency contracts.

**Non-Goals:**

- No autonomous NPC agents, multi-agent voting, parallel actor fan-out, or new client state authority.
- No player-visible UI or current-turn rules redesign.
- No state inference from prose and no expansion of Xingni facts beyond registered Qingshi content.
- No production migration execution, change archival, commit, push, or deployment.

## Decisions

### 1. One typed workflow replaces LangGraph and legacy/graph branching

`runWorldEngineTick` invokes a shared workflow with fixed stages: establish/recover run; load scoped context and capability profile; validate pacing signals; select cast; run at most one Actor batch; call one Director reasoner; normalize, validate, enforce, and capability-filter; optionally run a subtractive critic; transactionally persist outputs; expose a committed hint to the next applicable Writer turn.

This is chosen over LangGraph because the workflow is linear, bounded, and dominated by deterministic policy gates. A graph runtime added a second execution model without improving authority or safety and made production equivalence difficult to prove. A typed stage result preserves observability while keeping control flow explicit.

### 2. Scope is a value object, never inferred content

All new runtime APIs use `{ worldId, mapId, sessionId }` as an indivisible `WorldRuntimeScope`. V2 tick payloads require both world and map. A legacy payload with no scope is migrated only to Dark Moon's canonical world/map; partially specified or mismatched scope is rejected. Narrative, location labels, NPC names, and client digests are never used to infer scope.

All Director persistence receives `world_id` and `map_id`. Reads and writes use compound scope predicates. This is chosen over session-prefix conventions because sessions are not globally world-unique and conventions cannot be enforced by PostgreSQL.

### 3. Capability profiles are deterministic allowlists

`WorldDirectorCapabilityProfile` provides mode, registered IDs/action codes, and allowed capability families. Dark Moon may use its scoped registry, DB facts, locations, NPCs, events, and Social World data. Xingni is limited to registered Qingshi locations, NPCs, schedules, task phases, micro-events, and normalized world state. Xingni cannot originate rewards, realms, enemies, quest settlement, or new facts.

The capability validator runs after normalization, `validateDirectorPlan`, and `enforceDirectorPlan`. It only removes or rejects candidate material. This is chosen over prompt-only instruction because prompts do not constitute an authority boundary.

### 4. Actor Simulation is one fail-open batch projection

Deterministic cast selection chooses no more than three important living/in-scene NPCs. One `STORYLINE_SIMULATION` call receives isolated actor contexts and has a 2,048-token/30-second total budget. Projection validators require registered NPC, fact, location, and action references; insufficient evidence yields `blocked` rather than invented facts. Actor failure produces no projection context but does not stop the single Director call.

Parallel actor calls are rejected because they increase cost, race/conflict handling, and epistemic leak surface without a product requirement.

### 5. Critic is optional and strictly subtractive

The critic runs only for medium-risk accepted content or a new event type. Its input is the deterministic accepted set, and its output is intersected with that set. It cannot recover anything rejected by schema, validator, enforcer, capability, agenda prohibitions, or fact scope.

This makes the priority order enforceable: deterministic rules, committed prohibitions, due agenda, pacing/chapter signals, Actor projections, then Writer freedom.

### 6. Hints are committed envelopes, not prompt strings

`DirectorHintEnvelope` stores scope, run/revision, validity turn window, phase, validated directions, `must/should/may/forbid`, registered references, source metadata, and lifecycle status. It is created only from the final accepted plan in the same output transaction. Prompt assembly queries by exact scope, checks turn applicability, and renders a bounded Writer block. No candidate or rejected field is persisted as a hint.

`DirectorHintReceipt` is an internal considered/applied/skipped telemetry object. The server validates known hint IDs and allowed status values, emits append-only structured analytics, and removes the receipt before constructing the player final.

### 7. PostgreSQL owns job and run idempotency

`vc_jobs.idempotency_key` is protected by a unique `(job_type, idempotency_key)` index. Enqueue inserts first and returns `{ enqueued, jobId, dedupKey }`; duplicate inserts resolve to the existing job, while insertion errors return `enqueued: false`. Redis can cache outcomes but cannot lock before the database.

The worker creates or loads a compound-scope/dedup run in `running`. A succeeded run returns its existing non-zero `runId/worldRevision`. Agenda, state, social deltas, and hint are committed in one transaction; any output failure rolls back all outputs and marks the run failed separately.

### 8. Client StoryDirector becomes a compatible signal controller

The `storyDirector` persisted key and migration remain. Public types gain Pacing & Chapter Controller aliases, and post-turn code emits bounded numbers, enums, and IDs only. The worker independently validates phase, tension, chapter, IDs, and ranges against committed state and capability profiles. Free-form client direction is ignored.

### 9. Configuration has one Director path and independent kill switches

Default configuration is `AI_ENABLE_WORLD_DIRECTOR=true`, `AI_DIRECTOR_MODE=soft`, `VERSECRAFT_ENABLE_ACTOR_SIMULATION=true`, and `VERSECRAFT_ACTOR_SIMULATION_MODE=batch_soft`. A capability profile may downgrade one world to `shadow` or `off`. Disabling Actor skips its stage and continues with the single Director. All `VERSECRAFT_ENABLE_LANGGRAPH*` configuration and telemetry are removed.

## Risks / Trade-offs

- **[Large additive migration on active tables]** → Add nullable columns first, backfill legacy rows to Dark Moon, add compound indexes, verify no nulls, then tighten constraints in a separately reversible step.
- **[Dirty workspace overlap]** → Patch only relevant hunks, preserve current multi-world edits, and compare diffs before every broad formatter or deletion.
- **[Existing session-only callers]** → Keep temporary compatibility adapters that map only fully legacy records to Dark Moon; new writes require explicit scope.
- **[Prompt query regression]** → Use one indexed envelope lookup with an 80 ms deadline and fail open to no hint.
- **[Actor/Director latency or provider failure]** → Background-only 30-second Actor budget, one call maximum, structured telemetry, and no effect on current turn or SSE.
- **[Critic accidentally expands content]** → Represent accepted items by stable IDs and compute set intersection after critic output.
- **[Rollback after code disable]** → Kill switches stop reads/writes while additive columns/tables remain; no destructive down migration is required.

## Migration Plan

1. Add nullable `world_id`/`map_id` to Director tables, `idempotency_key` to jobs, and create the hint-envelope table.
2. Backfill all legacy Director data/jobs to Dark Moon's canonical scope, because the prior runtime explicitly skipped Xingni.
3. Deploy dual-read compatibility, compound indexes, and idempotent job insertion; validate there are no null scoped rows.
4. Switch all runtime reads/writes to compound scope, require scope for V2 payloads, then add non-null and compound uniqueness constraints.
5. Enable soft Director and batch Actor for both capability profiles, retaining independent off/shadow controls.
6. Remove LangGraph code, dependency, flags, tests, docs, and analytics after the typed path is covered by contract tests.

Rollback disables Director/Actor and reverts callers to no-hint fail-open behavior while retaining additive schema. It never maps Xingni data into Dark Moon or deletes new records.

## Open Questions

None. Product choices, migration identity, modes, budgets, and authority ordering are fixed by the approved plan.
