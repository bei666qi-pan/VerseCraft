## Why

VerseCraft currently assumes every player reads Simplified Chinese, which makes
the playable world and its stateful UI inaccessible to English-language
players. The product needs one coherent language preference that governs both
the generated turn and the surrounding gameplay experience.

## What Changes

- Add a persisted `zh-CN` / `en-US` gameplay-language preference and controls
  in character creation and in-game settings.
- Require newly generated player-facing DM narrative, choices, tasks, codex
  updates, and option repairs to follow the selected language while preserving
  the existing structured JSON and canonical state identifiers.
- Localize player-visible static gameplay chrome and registry-backed display
  copy, including character, codex, task, chapter, guide, waiting, and
  completion surfaces.
- Keep task-card player-facing content language-consistent after a language
  switch, and refine the mobile task board as a focused objective surface.
- Remove the redundant type word from unknown codex portrait cards, leaving
  the silhouette itself as the placeholder signal.
- Keep the original language of previously persisted free-form turn history;
  language selection applies to future generation and to deterministic display
  copy without mutating saved state.

## Capabilities

### New Capabilities

- `bilingual-gameplay`: Select and consistently render a Simplified Chinese or
  English interactive-narrative play experience.

### Modified Capabilities

- None.

## Impact

- Affects the client game-store persistence contract (a backward-compatible
  new preference with Chinese fallback), character creation, and `/play`
  presentation components.
- Affects `/api/chat` validation and the dynamic player-chat/option prompts.
  The request and SSE response shapes remain unchanged; `language` is an
  optional request field and missing values fall back to `zh-CN`.
- The runtime language instruction is built only after request validation and
  does not add an LLM call, database operation, or work before the existing
  first-status path. The existing `keys_missing` SSE degradation and final
  envelope remain unchanged.
- Does not change database schema, analytics event names or payload contracts,
  world-tick scheduling, epistemic filtering, or post-generation validation.
- This is product localization rather than a narrative-governance rule; the
  safe fallback for an unsupported or absent language is Simplified Chinese.
  No independent rollout flag is introduced because the preference must be
  usable by both supported language audiences on release.
