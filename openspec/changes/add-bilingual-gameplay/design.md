## Context

The game has a single Zustand game store and a streamed `/api/chat` turn
workflow. Its structured fields are canonical state, while narrative text is
presentation. The current prototype has Chinese-only client copy, seeded
registry display data, and prompt wording. The language preference must not
fork the store, change canonical identifiers, or alter the SSE final-envelope
contract.

## Goals / Non-Goals

**Goals:**

- Make `zh-CN` and `en-US` deterministic, persisted user choices.
- Render static gameplay UI and deterministic registry content in that choice.
- Give the selected language to every AI route that produces player-visible
  text, including options repair, without adding a new model call.
- Preserve client persistence and all existing generated-state fields.

**Non-Goals:**

- Translating previously generated, persisted free-form narration in place.
- Localizing internal IDs, database records, analytics payloads, lore facts,
  or server diagnostics.
- Adding a third locale, locale-aware dates/currencies, or a translation
  service.

## Decisions

### A typed preference is the language source of truth

`GameLanguage` is limited to `zh-CN` and `en-US`, defaults safely to Chinese,
and is persisted with the game store. Components read it from that same store;
they do not infer language independently. A store migration accepts old saves
without changing their gameplay state.

This is preferred to a React-only context because the preference must survive
refreshes and be included in the existing chat request. It is kept outside
per-run canonical game data so changing language does not affect a save's
state machine.

### Localize at display boundaries, preserve canonical state

Static UI strings and registry-backed labels receive typed translations or
language-aware formatters. State values, entity/task IDs, and API JSON keys
remain canonical. This avoids duplicate state and protects task/codex/save
compatibility.

### Carry language as optional chat input and dynamic prompt instruction

The client sends the selected language in the existing chat payload. Request
validation normalizes an absent/unknown value to Chinese. The server appends a
small runtime output-language directive to the existing prompt packets and
passes the language to every option-only repair helper. The stable prompt uses
language-neutral output rules so the directive is not contradicted.

This is preferred to separate endpoints or translated post-processing: it
preserves SSE timing and avoids a second model call. The SSE frame sequence,
final JSON shape, and all server-side guards/validators remain intact.

### New generated text follows the chosen language

The selected language applies to the opening and all future player-facing
generated narrative and structured text fields. Text already persisted in a
run remains in the language in which it was authored. Rewriting it on a toggle
would require an unbounded translation operation and could alter game history;
deterministic shell and registry copy still switches immediately.

### Localize task display content as one bounded presentation batch

The task board must not mix English chrome with Chinese task titles, hints, or
descriptions after a language switch. The existing display-localization route
will accept bounded task text patches and return the same task IDs with only
player-facing text fields translated. The client validates and prepares every
patch before committing the explicit presentation-only fields, then flips the
language together with the localized scene. Task status, IDs, rewards,
deadlines, and all structured gameplay fields remain untouched.

This reuses the existing explicit language-switch slow path rather than adding
work to `/api/chat` or creating a second task state. New turns continue to be
instructed to generate task fields in the selected language.

### Task board remains a presentation-only reading surface

The visual refresh changes hierarchy, density, and interaction affordances in
`PlayNarrativeTaskBoard`; it does not change task prioritization, claim rules,
visibility policy, or persisted task semantics. Unknown codex portrait cards
retain their silhouette, name, location, and accessibility metadata but omit
the redundant centered type word.

## Risks / Trade-offs

- [A model emits the wrong language] → Make the runtime directive explicit in
  both primary and options-only prompts; retain output shape validation and let
  users hand-enter an action if a repair fails.
- [A static player surface is missed] → Centralize language helpers and test
  the key character, codex, task, chapter, settings, and waiting surfaces.
- [Legacy persisted data lacks a language] → Normalize missing values to
  `zh-CN` in the store migration and request validator.
- [Extra prompt text delays first token] → The directive is a constant-sized
  string assembled after existing validation; it introduces no I/O or
  additional first-byte work.

## Migration Plan

1. Release the backward-compatible client-store migration and optional chat
   request field; old clients and saved state continue to select Chinese.
2. Validate the existing SSE/keys-missing contract, language helpers, and
   mobile `/play` layouts in both language choices.
3. If a regression is found, select `zh-CN` or omit `language`; the server's
   normalization restores the previous Chinese-only behavior without database
   rollback.

## Open Questions

- None for the initial two-language release. Historical free-form translation
  can be evaluated later as an explicit, opt-in feature.
