## Why

VerseCraft currently has two competing Director execution paths, incomplete world scoping, and queue semantics that can report work as enqueued even when PostgreSQL did not persist it. With both Dark Moon and Xingni now available, Director planning must converge on one typed, auditable, fail-open background workflow that cannot leak facts across worlds or bypass deterministic turn authority.

## What Changes

- Introduce one authoritative post-turn chain: `Committed Turn → World Director Candidate → Normalize/Validate/Enforce → Commit → Hint Envelope → Writer`.
- Run the same typed PostgreSQL-backed Director workflow for Dark Moon and Xingni, with explicit `worldId + mapId + sessionId` scope and per-world capability profiles.
- Upgrade world-engine tick input to a versioned, bounded V2 payload and validate all client pacing/chapter signals before Director use.
- Add reliable database-authoritative job idempotency and truthful enqueue receipts; retries recover an existing successful run instead of creating duplicate world evolution.
- Add committed, lifecycle-bound `DirectorHintEnvelope` records and internal, server-validated hint receipts that never appear in the player final frame.
- Enable a single bounded `batch_soft` Actor Projection step for at most three NPCs per tick in either world, with epistemic and capability filtering and fail-open degradation.
- Preserve the existing `storyDirector` persisted key while narrowing its responsibility to deterministic Pacing & Chapter Controller signals.
- Add world/map scope to Director persistence and perform an additive two-stage migration that backfills legacy Director data to Dark Moon only.
- **BREAKING**: remove the LangGraph runtime, dependency, configuration flags, analytics, tests, and documentation. There is no LangGraph fallback path.
- Preserve `/api/chat` SSE framing, the four minimum DM JSON fields, `resolveDmTurn` authority, final-after-commit ordering, and post-final non-blocking enqueue behavior.
- Mark `introduce-langgraph-director-orchestration` as superseded and `add-bounded-director-actor-simulation` as absorbed by this change without archiving either change.

## Capabilities

### New Capabilities

- `dual-world-director-runtime`: One typed, auditable Director workflow with explicit Dark Moon and Xingni capability profiles and deterministic validation order.
- `reliable-world-engine-jobs`: Versioned scoped tick payloads, PostgreSQL-authoritative idempotency, truthful enqueue receipts, recoverable runs, and transactional output commits.
- `director-hint-envelope`: Sanitized, committed, scope- and lifecycle-bound hints plus internal Writer-consumption receipts.
- `actor-projection`: One bounded batch projection for up to three world-scoped NPCs, with epistemic/capability filtering and blocked output when evidence is insufficient.

### Modified Capabilities

- `multi-world-runtime`: Require Director, jobs, persistence, prompt loading, and migrations to isolate all world-engine data by explicit `worldId + mapId` scope.
- `real-mechanics-director-evidence`: Require live evidence to prove truthful enqueueing, successful non-zero Director revisions, and same-session next-turn hint consumption in each world.

## Impact

- **Runtime/code**: `src/lib/worldEngine/*`, `src/lib/turnEngine/enqueueBackgroundTick.ts`, `src/lib/kg/jobs.ts`, prompt assembly, story Director signal handling, AI task routing/config, worker entrypoints, and Director probes/evals.
- **Database**: additive scope columns and compound indexes on Director state tables, a new hint-envelope table, and `vc_jobs.idempotency_key`; legacy rows are backfilled to Dark Moon and retained for rollback compatibility.
- **Dependencies/config**: remove `@langchain/langgraph` and all `VERSECRAFT_ENABLE_LANGGRAPH*` settings; retain unified Director and Actor kill switches with `soft`/`batch_soft` defaults.
- **SSE/JSON**: no player-visible `/api/chat`, SSE control/final frame, or minimum DM JSON contract changes. Internal hint receipts are stripped before the authoritative final frame.
- **State**: Turn Engine and `useGameStore` remain authoritative. The legacy `storyDirector` persisted key remains readable and writes deterministic signals only.
- **Analytics/logging**: preserve existing append-only event names, add structured scoped run/job/hint receipt metadata only, and never log full prompts, narratives, or raw player text.
- **Performance**: no Director, Actor, database write, or heavy retrieval enters the first-token path. Tick enqueue remains after final; prompt hint lookup retains the existing 80 ms p95 budget and all failures fail open.
- **Feature controls**: both worlds default to Director `soft` and Actor `batch_soft`; capability profiles may independently downgrade a world to shadow/off, and disabling Actor falls back to the single Director workflow.

## Non-Goals

- No player-facing page redesign, new gameplay state source, autonomous multi-agent negotiation, parallel NPC agents, or state inference from narrative text.
- No changes to current-turn adjudication, rewards, combat, progression, quest settlement, or the public final-frame schema.
- No archival of superseded changes, destructive schema rollback, production data operation, commit, push, or deployment.
