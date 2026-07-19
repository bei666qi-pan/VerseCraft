## Context

The real offline Director emitted low-priority `ambient_event` and `clue_update` payloads with empty boilerplate arrays. Existing normalization only recognizes equivalent internal payload names, so deterministic validation rejects the otherwise harmless agenda.

## Goals / Non-Goals

**Goals:** Normalize only those two aliases before existing safe-observation checks, so fixed player-agency defaults are applied only to the existing narrow class.

**Non-Goals:** Do not accept unknown payload types, relax high-risk validation, add a second model call, or affect `/api/chat` latency.

## Decisions

Map `ambient_event` to `ambient_sound`, and `clue_update` / `environmental_clue` / `environmental_event` to `environmental_change`, then reuse the established safe-observation predicate. This is narrower and more auditable than treating arbitrary low-priority types as safe.

## Risks / Trade-offs

- [Alias later carries forced content] → existing high-pressure text screen and validator still reject it.
- [Model returns other aliases] → they remain rejected and observable rather than silently accepted.

## Migration Plan

No migration: parser-only, backward-compatible behavior. Revert the two aliases to restore prior strict rejection.

## Open Questions

- None.
