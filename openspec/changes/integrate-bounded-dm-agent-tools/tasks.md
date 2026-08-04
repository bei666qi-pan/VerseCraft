# Tasks: integrate-bounded-dm-agent-tools

## Phase 1: DM Agent / Mechanics Lane 收口 (Narrative Chain Consolidation)

### Critical Fixes

- [x] **T1: Add `shouldAttemptDmAgent()` routing gate in route.ts**
  - Only mechanics-classified inputs enter DM Agent path
  - Narrative/ambiguous inputs go directly to normal PLAYER_CHAT
  - Import added at line 268, gate at line 2002
  - Routing telemetry recorded via `dm_agent_routing` analytics event

- [x] **T2: Fix `agentUsed` semantics in dmAgentRouteIntegration.ts**
  - `tryRunDmAgentTurn` now returns `agentUsed=true` only when `result.toolsUsed` is true
  - Narrative-only model outputs (no tool calls) correctly fall back to normal path
  - Changed `if (result)` → `if (result && result.toolsUsed)` at line 164

- [x] **T3: Remove FINAL bypass — add full final chain to DM Agent path**
  - DM Agent path now runs: NPC consistency → validateNarrative → commitTurn → FINAL → background tick
  - `applyNpcConsistencyPostGeneration` called with minimal args (DM Agent path lacks full epistemic context)
  - `validateNarrative` called with agent state delta
  - `commitTurn` called with validator report
  - `COMMIT_STATE_CHANGING_FIELDS` and `COMMIT_STATE_MIRROR_FIELDS` applied from committed record
  - `scheduleBackgroundWorldTick` called non-blocking
  - `chat_request_finished` analytics written with unified payload
  - `dm_agent_turn_completed` analytics preserved
  - `world_engine_enqueued` analytics written on successful tick

- [x] **T4: Verify feature flag off behavior**
  - `VERSECRAFT_ENABLE_DM_AGENT=false` → DM Agent path not entered
  - `shouldAttemptDmAgent()` returns false for narrative inputs → DM Agent path not entered
  - Normal PLAYER_CHAT path unchanged

### Verification

- [x] **T5: Lint passes** — `npx eslint src/app/api/chat/route.ts` clean
- [x] **T6: Unit tests pass** — 143 tests across 21 suites pass
  - Mechanics intent router: 45/45 ✓
  - Route integration: 3/3 ✓
  - Orchestrator + integration + state merger: 42/42 ✓
  - validateNarrative: 49/49 ✓
  - Chat route contract: 4/4 ✓

### Remaining for Future Phases

- [ ] E2E tests with live gateway (requires environment)
- [ ] Extract DM Agent final chain into shared module (refactor, not behavior change)
- [ ] Add proper epistemic context to DM Agent path (currently uses minimal args)
- [ ] DM Agent `dmAgentRouteIntegration.test.ts` needs update for new agentUsed semantics
