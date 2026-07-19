## Context

Malformed streamed DM JSON is repaired only after generation completes. The current 2,000 ms default is below the measured p95 (2,668 ms) for the configured gateway, so repair frequently times out even though the normal gateway is healthy. The result is a visible `site_fallback` rather than a safe repaired envelope.

## Goals / Non-Goals

**Goals:**

- Give exceptional final-hook repair a default 6,000 ms window, still bounded by the existing 1,000–12,000 ms clamp; malformed-DM remains limited to a 4,000 ms request while post-validator narrative repair may use the full window.
- Preserve status frames, final envelope and conservative fallback if repair truly fails.
- Prove the budget is post-generation and configurable.

**Non-Goals:**

- Do not add retries or model calls to normal turns, alter TTFT, route PLAYER_CHAT to reasoner, or change state from prose.

## Decisions

### Use a 6-second shared window with a narrower malformed-DM request

The observed 2.67-second p95 needs margin for a small malformed repair, while real post-validator narrative repairs have exceeded three seconds. A six-second shared window remains below the 12-second existing cap, applies only after generated text exists, and does not raise the normal upstream timeout.

### Retain environment override and visible fallback

`VC_FINAL_REPAIR_BUDGET_MS` remains the operational rollback lever; `site_fallback` remains correct when repair cannot finish. No new flag is required because this changes an existing bounded configuration value.

### Repair non-injection entity hard blocks before fallback

An unknown entity remains a zero-tolerance state-commit violation. However, its player-visible narrative is often recoverable by removing the invented entity rather than discarding the whole turn. The existing repair branch is extended to attempt exactly one narrative-only model repair for `shouldBlockCommit` unless the safety report identifies prompt injection. The repaired result is revalidated by the same kernel and only then can avoid deterministic fallback; failure preserves the hard block.

## Risks / Trade-offs

- [Malformed turns wait longer] → only an already failed final hook uses the window; normal TTFT is unchanged and hard cap remains 12 seconds.
- [Gateway outage] → repair still exits at budget and emits existing parseable fallback.

## Migration Plan

Deploy default 6,000 ms; operators may set `VC_FINAL_REPAIR_BUDGET_MS=4000` to restore the narrower window. No schema/data migration.

## Open Questions

- None.
