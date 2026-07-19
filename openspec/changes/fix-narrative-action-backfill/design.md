## Context

`validateNarrative` executes after the model supplies a candidate DM record. It can run `resolveActionsFromNarrative` as a bounded audit signal, but state deltas must never be inferred from narrative prose. The call currently passes an undeclared identifier instead of the parsed existing currency delta. Its local `try/catch` turns the resulting `ReferenceError` into a silent no-op.

## Goals / Non-Goals

**Goals:**

- Restore the bounded action resolver call so supported narrative actions can be audited.
- Retain structured model deltas as the exclusive state authority and preserve conservative no-op behavior if action resolution itself fails.
- Add deterministic regression coverage for the call boundary.

**Non-Goals:**

- Do not make arbitrary narrative authoritative, add LLM judging, change item ownership rules, or expand the resolver's phrase vocabulary.
- Do not change SSE framing, store persistence, database state, prompt content, task/profession rules, or director execution.

## Decisions

### 1. Pass the parsed existing delta explicitly

Use the already parsed `originiumChange` variable as `existingOriginiumChange`. This restores the resolver contract while retaining compatibility with the legacy currency object input. Its output is telemetry-only: retaining the previous mutation would contradict state-delta authority and allow prose to create inventory. Renaming or relaxing the resolver parameter would obscure the call-site mistake and enlarge the surface area.

### 2. Test the public validation outcome, not a private implementation detail

The regression invokes `validateNarrative` with a narrative action and empty candidate fields, then verifies the action is observable while the candidate DM remains unchanged. A companion test verifies existing structured values are retained. This proves the gameplay-relevant boundary without coupling to variable names.

### 3. Keep exception containment conservative and observable through tests

The existing containment remains: a resolver failure produces no backfill rather than invented state. Type checking and the regression test prevent an undefined caller variable from becoming that silent fallback again.

## Risks / Trade-offs

- [Resolver recognizes an overly broad phrase] → This change does not expand recognition rules; existing validator/commit gates remain authoritative.
- [Future caller type mismatch is swallowed] → Targeted regression plus strict TypeScript check cover the known boundary; future resolver errors retain no-state-change behavior.
- [Minor final-hook CPU work] → The existing pure resolver runs after generation and requires no network or IO, so it cannot affect first status/text or TTFT.

## Migration Plan

1. Deploy as a backward-compatible bug fix with no persistence migration or rollout flag.
2. If unexpected backfill behavior appears, revert the single call correction; existing no-op behavior returns without data repair.

## Open Questions

- None. Broader natural-language action recognition requires separate evidence and proposal.
