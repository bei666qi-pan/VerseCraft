## ADDED Requirements

### Requirement: Options-only refresh does not require a player action
An explicitly identified `options_regen_only` request SHALL be valid without a historical player-action message when it includes current narrative or structured regeneration context. A normal chat request SHALL continue to reject empty player input.

#### Scenario: Opening narrative has no user log entry
- **WHEN** the client requests `options_regen_only` after the authored opening and supplies the current narrative or options regeneration context but no historical user message
- **THEN** the server enters the options-only fast path and attempts bounded model option generation

#### Scenario: Ordinary chat has no player action
- **WHEN** a normal chat request contains no non-empty user action
- **THEN** the existing empty-input SSE rejection remains in effect and no model is invoked

### Requirement: Options refresh failures remain actionable and correlatable
An options-only failure SHALL preserve a bounded reason category and request correlation identifier, and the client SHALL offer an explicit retry or manual-input path.

#### Scenario: Upstream generation fails
- **WHEN** the options-only model call times out, fails, or produces insufficient usable options
- **THEN** the client shows a trustworthy failure state with retry/manual action and a short request identifier instead of silently presenting an ordinary empty state
