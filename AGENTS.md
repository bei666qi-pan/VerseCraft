# VerseCraft Agent Rules

## Sources of truth

- Read `CONTEXT.md` before changing narrative-runtime terms.
- Architecture decisions live in `docs/adr/`: [ADR-0001](docs/adr/0001-single-turn-and-director-workflows.md) defines the workflows, [ADR-0002](docs/adr/0002-director-storage-and-save-migration.md) defines storage convergence and legacy-save migration, and [ADR-0003](docs/adr/0003-no-online-turn-response-cache.md) prohibits cached turn responses from bypassing the sole Finalizer.
- ADR-0001 was amended on 2026-09-03: Writer has one four-field narrative-candidate wire contract; the full DM JSON terminal and compatibility retry no longer exist.
- Code and executable tests describe current behavior. `openspec/specs/` describes accepted behavior; an active change is not proof of implementation.
- Use simplified Chinese in user-facing work. Never fabricate test, deployment or live-integration success.

## Canonical architecture

`Player action → PlayerTurnWorkflow → Writer or Mechanics Workflow → Turn Engine commit → __VERSECRAFT_FINAL__ → asynchronous World Director → later Director Directive`

- Writer is the only source of player-visible narrative and emits only narrative, four options and bounded turn-shape fields; it never proposes state.
- Mechanics Workflow is bounded, world-scoped and cannot commit or emit FINAL.
- Turn Engine is the only validation, resolution and commit authority. Every successful request emits exactly one authoritative FINAL.
- Complete online turn responses are never cached or replayed; knowledge caches may hold only non-authoritative retrieval inputs.
- Chapter Pacing Controller is a deterministic client projection, not a Director.
- World Director is asynchronous, fail-open and limited to future direction. It never enters the current-turn first-token path.
- Every world operation carries `worldId + mapId + sessionId`; scope is never inferred from prose.
- Prefer explicit typed workflows over autonomous loops or graph frameworks. Model output is never authoritative.

## Runtime contracts

- Preserve `text/event-stream`, `__VERSECRAFT_STATUS__` and `__VERSECRAFT_FINAL__:<json>`.
- Missing AI configuration still returns `200 + SSE`, a truthful status and a parseable final envelope.
- Never infer state from narrative. Registered rules, typed deltas, guards, validators and commit decide what happened.
- Player-visible tasks must not fall back to `reasoner` or `enhance`.
- Model/tool/DB failures must not produce half commits or duplicate final frames.
- PostgreSQL is authoritative for durable state and job idempotency; Redis is coordination/cache only.
- Do not log prompts, narrative, raw player input or credentials.

## Budgets

- Credible feedback p95 ≤ 800ms; first visible text p95 ≤ 5s; concrete narrative hard max ≤ 8s; ordinary final p95 ≤ 20s.
- Options maintenance is deterministic and must complete within a 5s client/server ceiling.
- Narrative lane: at most one generative invocation.
- Mechanics lane: at most two generative invocations, one state-changing command and 20s total.
- World Director: at most one invocation, 2048 output tokens and 45s per eligible tick, normally no more often than every four turns.
- Every invocation records real usage correlated to request/run/task/lane/round. Never use zero or character estimates as proof of cost.

## Working rules

- Protect unrelated and untracked user work. Use a clean worktree for broad changes.
- Use `pnpm@10` and Node from `.node-version`. Development runs on port 666.
- Use TDD for behavior changes: write and observe a failing behavior test, implement minimally, then refactor.
- Test through a Module Interface. Delete source-text tests and obsolete implementation tests after replacement coverage exists.
- Schema changes require forward migration, compatibility behavior, rollback notes and a real Postgres check.
- Generated runs, screenshots, traces, reports, backups and nested dependencies belong in ignored runtime directories, never Git.
- Product PNG assets are allowed; test/dogfood screenshots are not.

## Required verification

- Relevant behavior tests, lint, typecheck and build are hard gates; timeouts, warnings-as-success and skipped required checks are failures.
- Turn/AI/Director changes also require SSE contracts, mock chat benchmark, Director/Social World/NPC consistency/narrative safety evaluation and dual-world scenarios.
- Deploy only through feature branch → GitHub PR → GitHub main → Gitee mirror → Coolify.
- Production completion requires deployment `finished`, application `running:healthy`, business health JSON, public build ID matching the target SHA, and real browser acceptance.
