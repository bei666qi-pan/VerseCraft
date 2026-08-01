## Why

Live developer playthroughs showed that `/api/chat` can return a visible `site_unavailable` result even when the AI gateway is configured and the upstream connection succeeds. The failure occurs when more than one eligible player-chat stream yields no visible content: the second empty stream is not allowed to use its bounded recovery path.

## What Changes

- Scope empty-stream recovery by attempted source so a fallback source is not denied its own bounded retry because a previous source was empty.
- Preserve the existing SSE envelope, final DM JSON fallback, reconnect wall-clock budget, and retry caps.
- Add regression coverage for sequential empty player-chat streams and retain the deterministic fallback once the bounded recovery budget is exhausted.
- Add routing telemetry that identifies the source associated with an empty-stream recovery decision.

## Capabilities

### New Capabilities

- `player-chat-stream-recovery`: Bounded, source-aware recovery of empty live player-chat streams before a visible site-failure fallback is emitted.

### Modified Capabilities

<!-- None. -->

## Impact

- Affected code: `/api/chat` stream reconnect coordination and its focused route-level regression test.
- SSE/JSON: no wire-format change; `200 + text/event-stream`, status frames, and `__VERSECRAFT_FINAL__` remain unchanged.
- State, analytics, and database: no state schema or database change; routing telemetry gains only source context for existing recovery decisions.
- Performance: recovery remains bounded by the existing reconnect-round and wall-clock limits, and does not delay the first status frame or introduce a pre-token dependency.
- Degradation: the existing visible failure payload remains the deterministic terminal behavior after recovery is exhausted. No new feature flag is needed because this corrects an internal budget accounting defect without changing the user-facing contract.
- Non-goals: changing AI role policy, expanding the player-chat role chain, adding unbounded retries, or changing DM JSON normalization/validation.
