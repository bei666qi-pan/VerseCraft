## Context

`resolveTurnConsistency` already sees candidate narrative and authoritative award deltas after generation. Its acquire-semantic downgrade detects common phrases, but `捡起了` currently rewrites to itself and therefore never applies. The live mechanics trace exposed that weakness. This is a final-hook concern: it must not delay SSE status/first text or add an LLM call.

## Goals / Non-Goals

**Goals:**

- Preserve state-delta authority when narrative claims an uncommitted acquisition.
- Rewrite only a bounded acquisition phrase to an observation/inspection phrase, append a short uncertainty sentence, and record a consistency flag.
- Provide an env-backed rollout flag and pure regression tests.

**Non-Goals:**

- Do not parse narrative into new inventory state or infer an item identity.
- Do not change supported awards, weapon mechanics, prompt text, task state, SSE framing, database schema, or model routing.

## Decisions

### 1. Degrade a bounded phrase, not the entire narrative

Replace the first unsupported acquisition verb with a non-ownership observation (`捡起了` → `注意到了一件`) and retain surrounding literary detail. This is preferable to dropping the whole response: it preserves play flow without allowing an explicit false state claim.

### 2. Gate at the existing final consistency resolver

The resolver already runs after model generation and before the final envelope. It has the candidate awards and is pure, so it creates no first-token latency. The change adds a `VERSECRAFT_ENABLE_NARRATIVE_STATE_CONFLICT_DEGRADE` rollout flag; disabled preserves candidate narrative while retaining existing validation telemetry.

### 3. Treat failure to rewrite as a visible conservative fallback only for flagged acquire conflicts

If a phrase is detected but no bounded rewrite succeeds, use a short player-facing observation sentence instead of a state assertion. Do not invent an item or award. Existing validator/audit metadata remains available for diagnosis.

### 4. A hard safety block neutralizes candidate combat claims

When the existing hard safety policy blocks a candidate that contains a conflict outcome, `commitTurn` replaces the player-visible combat claim with a no-state-change fallback and clears options. The policy inherits the existing narrative safety hard/shadow rollout: shadow remains observational, while hard mode cannot expose a combat result whose structured delta was stripped. This is deliberately narrower than general combat prose rewriting.

## Risks / Trade-offs

- [A literary sentence uses “捡起” without intent to own] → The change remains narrowly gated on absent award deltas and is reversible through the flag.
- [The model later correctly represents weapons through another field] → This change only examines award deltas; mechanics-specific fields remain untouched and tests cover the no-award case.
- [Over-aggressive rewrite harms prose] → One phrase only, plus live trace review and shadow telemetry.

## Migration Plan

1. Ship behind the rollout flag enabled in development/staging and observe consistency flags.
2. Run unit/contract tests plus a real `/api/chat` trace containing the former conflict.
3. Disable the flag to restore prior shadow-only behavior if any false positive emerges; no schema or data migration is required.

## Open Questions

- None for the bounded v1 rule. Additional state domains require separate evidence before being added.
