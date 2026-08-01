## Why

A live deterministic golden case showed that an ordinary attempt to approach and greet a named NPC can be returned as `is_action_legal: false` when the target is absent or unregistered. The world must not materialize an unknown NPC, but the player's harmless attempt remains a legal action and should resolve as an unsuccessful contact attempt.

## What Changes

- Add a narrow production adjudication rule for ordinary approach/greeting attempts that preserves action legality while leaving an absent or unknown target unavailable.
- Add regression tests reproducing `golden-talk-to-npc`, `golden-talk-to-npc-npcswap-3`, `golden-talk-to-npc-var-2`, `golden-talk-to-npc-var-2-npcswap-3`, `golden-talk-to-npc-repeat-3`, `golden-talk-to-npc-var-2-var-3`, `keepalive-normal-talk-var-2`, `keepalive-normal-talk-var-2-repeat-3`, `keepalive-normal-talk-var-3`, `keepalive-normal-talk-repeat-3`, and `keepalive-normal-talk-var-2-var-3` before implementing each rule refinement.
- Preserve legality when a harmless contact attempt is degraded only because its narrative contains protocol leakage, while replacing the unusable narrative with a deterministic no-contact fallback.
- Preserve all entity, state-delta, SSE, and final-envelope guards; do not create NPC, relationship, codex, location, or task state for an unknown target.
- Exclude coercive, violent, supernatural-control, and other independently illegal social actions from the override.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `turn-playability-guards`: Clarify that harmless greeting attempts remain legal even when the named target cannot be found, without legitimizing or committing the target as a world entity.

## Impact

- Production code: `src/lib/playRealtime/registeredMechanicsGuard.ts`.
- Tests: `src/lib/playRealtime/registeredMechanicsGuard.test.ts`, including exact live final-envelope regressions for the two follow-up failures.
- SSE/JSON: no shape, transport, status-frame, or `__VERSECRAFT_FINAL__` contract change; only the authoritative value of `is_action_legal` for the narrow intent changes.
- State, analytics, and database: no schema/event changes and no new state writes.
- Performance: synchronous regex/field cleanup in an existing final guard; no model call, I/O, retry, or TTFT-path work. Existing fallback behavior remains unchanged.
- Non-goals: prompt expansion, eval/gate changes, NPC registry changes, or broad social-action redesign.
