## ADDED Requirements

### Requirement: Safe Director payload aliases retain existing deterministic guardrails

The world-engine parser MUST normalize `ambient_event` to `ambient_sound` and `clue_update`, `environmental_clue`, and `environmental_event` to `environmental_change` before applying the existing safe-observation defaults. It MUST only supply defaults when the normalized event already meets the low-risk predicate.

#### Scenario: Real-model ambient alias has empty boilerplate

- **WHEN** a low-priority `ambient_event` has empty agency and forbidden arrays with no forced-outcome language
- **THEN** it MUST receive the existing fixed protections and be accepted as a consumable agenda candidate

#### Scenario: Real-worker environmental event alias has empty boilerplate

- **WHEN** a low-priority `environmental_event` has empty agency and forbidden arrays with no forced-outcome language
- **THEN** it MUST normalize to `environmental_change`, receive the existing fixed protections, and be accepted as a consumable agenda candidate

#### Scenario: Dangerous event remains rejected

- **WHEN** an event is high priority or contains forced-outcome language, regardless of payload alias
- **THEN** it MUST not receive safe defaults and the validator MUST reject it when protections are empty
