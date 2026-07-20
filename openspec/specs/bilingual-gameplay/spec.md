## Purpose

Provide a consistent Simplified Chinese and English gameplay experience without
changing the canonical state or the existing real-time turn contract.

## Requirements

### Requirement: Persisted gameplay language selection

The system SHALL provide `zh-CN` and `en-US` as the only supported gameplay
languages, persist the selected value in the single client game store, and
normalize a missing or unsupported stored value to `zh-CN`.

#### Scenario: User selects English

- **WHEN** a player selects English in character creation or in-game settings
- **THEN** the preference SHALL persist across refreshes and all deterministic
  player-facing gameplay chrome SHALL render in English

#### Scenario: Legacy saved preference is absent

- **WHEN** a stored game state predates the language preference
- **THEN** the game SHALL hydrate successfully with `zh-CN` selected

### Requirement: Language-consistent generated turns

The system SHALL accept an optional gameplay-language value with the existing
chat request and SHALL instruct the primary turn generator and all
player-facing option repair routes to produce the selected language. It MUST
preserve the SSE framing and final DM JSON contract.

#### Scenario: English turn

- **WHEN** an `en-US` player submits an action or asks to regenerate choices
- **THEN** newly generated narrative, choices, task/codex text, and other
  player-facing structured copy SHALL be requested in English while canonical
  JSON keys and identifiers remain unchanged

#### Scenario: Language is omitted

- **WHEN** an existing client submits a chat request without a language value
- **THEN** the server SHALL use `zh-CN` and return the existing SSE response
  behavior, including status and final frames

### Requirement: Localized gameplay presentation

The system SHALL localize deterministic player-visible content for both
supported languages across character creation, play settings, character,
codex, task, chapter, guide, waiting, navigation, and completion surfaces.

#### Scenario: English player opens gameplay panels

- **WHEN** an `en-US` player opens the character, codex, task, chapter, guide,
  or settings panel
- **THEN** its static labels and registry-backed display content SHALL be
  English without changing underlying canonical state

#### Scenario: English player views existing tasks after a language switch

- **WHEN** an `en-US` player opens the task panel after switching from Chinese
- **THEN** every visible task title, description, hint, issuer label, and
  task-board fallback label SHALL be English while task IDs, statuses, rewards,
  deadlines, and visibility rules remain unchanged

#### Scenario: Chinese player continues play

- **WHEN** a `zh-CN` player opens the same surfaces or receives a turn
- **THEN** all deterministic player-visible copy SHALL remain Simplified
  Chinese and existing gameplay behavior SHALL be preserved

### Requirement: Historical narration is stable

The system SHALL retain the original authored text of a saved free-form
narrative entry when the language preference changes.

#### Scenario: Player switches language mid-run

- **WHEN** a player changes language after prior turns have been saved
- **THEN** static display content and future generated turns SHALL use the new
  language while existing saved narrative remains unmodified

### Requirement: Focused mobile task and codex placeholder presentation

The system SHALL present the mobile task panel as a focused, readable objective
surface with clear primary-task hierarchy, progress context, and compact
secondary actions. Unknown codex portrait cards SHALL not show a redundant
centered type word over the silhouette.

#### Scenario: Player opens the mobile task panel

- **WHEN** a player opens the task panel at a supported mobile viewport
- **THEN** the current objective, its next actionable step, progress context,
  and secondary task groups remain readable without changing task actions or
  state transitions

#### Scenario: Player sees an unknown codex portrait card

- **WHEN** a codex slot is not yet identified
- **THEN** its silhouette placeholder is shown without the centered `人物` or
  `Person` type label
