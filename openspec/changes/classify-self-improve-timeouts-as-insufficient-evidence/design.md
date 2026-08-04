## Context

The deterministic evaluator emits invariant results even when `trace.parsedDmJson` is absent because the live request timed out. The strict verifier currently scores every emitted invariant, ignoring the case-level `errors` already persisted beside it. Consequently, missing evidence becomes either a false failure or a false pass depending on the invariant's expected polarity.

## Goals / Non-Goals

**Goals:**

- Exclude execution-error cases from oracle match and failing-case calculations.
- Return `INSUFFICIENT_EVIDENCE` with exit code 2 whenever deterministic cases are unusable.
- Keep genuine conclusive mismatches as `STRICT_FAIL`.

**Non-Goals:**

- Changing scenario expectations, strict thresholds, holdouts, or live-call timeout values.
- Fixing upstream gateway latency or gameplay behavior.
- Changing `/api/chat` or the deterministic invariant definitions.

## Decisions

The strict verifier will use the existing case-level `errors` field as the validity boundary. A deterministic case with one or more errors is excluded from oracle totals and failing-case clustering, counted as inconclusive evidence, and forces an insufficient-evidence result. This fixes existing artifacts without requiring a format migration.

An alternative was to make `checkDeterministicInvariant` infer results from missing DM JSON. That retains polarity-dependent false results and cannot distinguish transport failure from valid rejection, so it is rejected. Another alternative was to change the live timeout; that only shifts the symptom and does not make the gate evidence-safe.

## Risks / Trade-offs

- [Risk] A case may record a non-fatal warning in `errors` despite having a usable final payload. → The current runner uses `errors` for execution/SSE failures; regression coverage will pin the conservative behavior, appropriate for a strict gate.
- [Risk] Fewer scored invariants can make a run look cleaner. → Any excluded case forces `INSUFFICIENT_EVIDENCE`, so exclusion can never produce `STRICT_PASS`.
