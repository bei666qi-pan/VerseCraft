## Context

`/api/chat` accepts the live player action, emits the established SSE status frames, and streams one upstream player-chat source at a time. A completed upstream stream with fewer than the minimum visible characters is classified as `EMPTY_CONTENT`. The current reconnect limiter accounts for empty streams globally, so a prior source can consume the recovery allowance intended for a later fallback source.

The repair must retain the existing staged turn workflow: upstream streaming remains before final hooks, while validation, structured turn resolution, analytics, and world tick behavior remain untouched. It must also remain within the existing reconnect-round and wall-clock limits.

## Goals / Non-Goals

**Goals:**

- Make empty-stream recovery source-aware so a fallback source is evaluated against its own bounded allowance.
- Preserve the current SSE and final DM JSON contract, including the existing visible fallback after all eligible recovery paths are exhausted.
- Make the recovery decision observable in existing AI routing telemetry.
- Add deterministic regression coverage for the sequential-empty-source path.

**Non-Goals:**

- Altering `PLAYER_CHAT` role policy, model configuration, prompt text, or the main/control fallback ordering.
- Adding retries beyond the existing reconnect wall-clock or source-round caps.
- Changing final hooks, validators, state-delta resolution, analytics schemas, or client behavior.

## Decisions

### Account empty recovery by source identity

The reconnect coordinator will track empty-content recovery against the failed source identity rather than a single turn-global counter. A source that has already consumed its empty-content allowance will be skipped according to the current fallback routing flow; a distinct eligible fallback source retains one allowance.

This preserves the current deterministic routing workflow while fixing the accounting leak between independent sources. A turn-global retry increase was rejected because it would mask repeated failures from the same upstream source and could extend visible waiting time.

### Retain current hard budgets and terminal payload

The existing maximum stream-source rounds, stream-interruption cap, and wall-clock reconnect limit remain the authority for total work. Once a source-aware recovery is not eligible or no source remains, the route emits the same status/final SSE payload that resolves to the existing `site_unavailable` state.

This avoids changing the frontend parser and keeps the user-visible degraded path stable.

### Test at the routing boundary

The focused player-stream fallback test will simulate a sequence of empty stream sources. It will assert that the second source reaches its own permitted recovery decision and that the route remains bounded and emits a valid final envelope after all paths are exhausted.

This is preferred to a live-gateway test because the upstream empty-stream condition is nondeterministic and the limiter is deterministic server logic.

## Risks / Trade-offs

- [A source-aware allowance could add one upstream attempt.] → The existing per-turn round and wall-clock limits remain unchanged; the regression test asserts bounded completion.
- [Source identity may not map one-to-one to a provider model.] → Use the existing logical-source identity already used by fallback routing; do not introduce a new provider/model identity contract.
- [A terminal fallback can still occur for genuinely empty upstream output.] → Preserve it intentionally and record the source-specific reason in routing telemetry for diagnosis.

## Migration Plan

1. Deploy as an internal server-side behavior correction with no client or schema migration.
2. Monitor existing `PLAYER_CHAT` routing telemetry for `EMPTY_CONTENT`, reconnect count, and final fallback rate.
3. Roll back by reverting the source-aware accounting change; SSE and stored data remain compatible.

## Open Questions

None. The observed failure and existing bounded-recovery architecture provide sufficient scope for this repair.
