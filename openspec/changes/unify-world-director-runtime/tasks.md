## 1. OpenSpec and contracts

- [x] 1.1 Mark the LangGraph change superseded and the bounded Actor change absorbed without archiving either change
- [x] 1.2 Add V2 world tick, runtime scope, capability profile, hint envelope/receipt, and typed workflow contracts with legacy Dark Moon migration rules
- [x] 1.3 Add unit tests for payload validation, legacy migration, capability allowlists, and cross-world rejection

## 2. Reliable jobs and scoped persistence

- [x] 2.1 Add additive database schema/migration support for world/map scope, hint envelopes, run lifecycle, and job idempotency
- [x] 2.2 Make PostgreSQL insertion/dedup authoritative and return truthful enqueue receipts
- [x] 2.3 Scope Director run, agenda, snapshot/state, NPC state, and hint repository reads/writes by world/map/session
- [x] 2.4 Add queue and repository tests for insertion failure, duplicate idempotency, same-session world isolation, legacy backfill, and rollback

## 3. Unified Director workflow

- [x] 3.1 Implement capability profiles and server validation for Dark Moon and Xingni Qingshi
- [x] 3.2 Implement validated Pacing & Chapter Controller signals while preserving the legacy storyDirector persistence key
- [x] 3.3 Integrate deterministic cast selection and one bounded batch Actor Projection call with epistemic filtering and blocked output
- [x] 3.4 Implement fixed normalize/validate/enforce/capability/critic ordering with a strictly subtractive critic
- [x] 3.5 Persist run outputs and sanitized hint envelope transactionally, with fail-open stage handling and succeeded-run recovery
- [x] 3.6 Add workflow tests covering both worlds, Actor failure fallback, rejected candidates, critic subtraction, stale/repeated runs, and transaction failure

## 4. Writer consumption and online contracts

- [x] 4.1 Load and applicability-gate committed hint envelopes by exact world/map/session scope and render a bounded Writer prompt block
- [x] 4.2 Validate internal hint receipts, append structured telemetry, and strip receipts from the player final
- [x] 4.3 Enqueue V2 ticks only after final for both worlds and preserve SSE/DM JSON and online latency behavior
- [x] 4.4 Add contract tests for both-world final frames, post-final enqueue, same-session next-turn hint use, receipt stripping, and 80 ms hint lookup fail-open

## 5. LangGraph and configuration removal

- [x] 5.1 Remove LangGraph runtime code, imports, dependency, feature flags, telemetry, tests, and documentation references
- [x] 5.2 Set unified Director soft and Actor batch_soft defaults with independent capability-profile downgrade and kill-switch behavior

## 6. Verification and evidence

- [x] 6.1 Run targeted unit and database/worker integration tests and update Director eval/probe evidence
- [x] 6.2 Run `pnpm test:unit`, `pnpm lint`, `pnpm build`, `pnpm test:e2e:contract`, and `pnpm benchmark:chat:mock`
- [x] 6.3 Run Director, NPC consistency, and narrative safety evals plus the live Director probe when PostgreSQL and gateway are available
- [x] 6.4 Strictly validate the OpenSpec change, confirm no LangGraph residue, and document completed evidence or environmental blockers

## Verification evidence (2026-08-14)

- Focused Director/queue/route contracts: 46/46 passed.
- `worldDirector.postgres.integration.test.ts`: 5/5 passed against the dedicated `versecraft_director_integration` PostgreSQL database, proving additive Dark Moon-only backfill and scope finalization, database-authoritative job deduplication, truthful insertion-failure receipts, stale-lock recovery, same-session cross-world hint isolation, 80 ms lookup fail-open, output-transaction rollback, and succeeded-run idempotent recovery.
- Actor Projection budget regression: 4/4 passed after adding a wall-clock timeout/abort gate, including fail-open behavior when a provider ignores its abort signal. Actor failure still permits the single Director call.
- Dual-world live probe used one shared session identifier and consumed committed hints through the production Writer consumer: Dark Moon persisted job 7/run 11/revision 2 and consumed a 652-character hint; Xingni persisted job 10/run 15/revision 3 and consumed a 653-character hint. Both reports passed with non-zero run/revision and exact world/map isolation.
- `pnpm test:unit`: Node tests 3970 passed, 1 skipped, 0 failed; Vitest 295/295 passed.
- `pnpm lint`: passed with 0 errors and 120 pre-existing warnings.
- `pnpm build`: passed; only existing Next.js Edge `process.once` and middleware warnings were emitted.
- `pnpm test:e2e:contract`: after starting the dedicated test server, 5 passed and 6 environment-gated variants skipped. The initial no-server attempt failed before that rerun and is not counted as a passing run.
- `pnpm benchmark:chat:mock`: an earlier full run passed 10/10. The latest full rerun preserved 10/10 HTTP 200, final frames, contracts, and option-quality checks with first-status p95 7 ms, first-token p95 67 ms, final p95 284 ms, and zero long gaps, but the overall quality gate failed 9/10 because the pre-existing modified `item_interaction` fixture produced a 44-character narrative below its authoritative 560-character minimum. No fixture or assertion was changed to hide this unrelated failure.
- `pnpm eval:director`: 20 cases, 0 failures.
- `pnpm eval:npc-consistency:mock`: 8 cases, gate passed.
- `pnpm eval:narrative-safety:mock`: 119 cases, all dimensions 1.000, severe=0, gate passed.
- `openspec validate unify-world-director-runtime --strict`: passed.
- LangGraph residue scan across runtime source, scripts, E2E, active docs, dependencies, lockfile, and example configuration: no matches.
- `git diff --check`: passed.
