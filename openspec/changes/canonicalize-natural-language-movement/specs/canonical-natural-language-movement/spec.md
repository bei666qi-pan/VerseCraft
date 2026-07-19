## ADDED Requirements

### Requirement: Natural-language movement commits one canonical adjacent location

When an action expresses movement and the current position, a recognized destination phrase or vertical direction identify exactly one registered, traversable adjacent graph edge, the final DM record MUST commit that edge's canonical `player_location`. It MUST NOT commit a multi-hop destination or derive state from narrative prose.

#### Scenario: Legacy third-floor hallway enters the registered stairwell
- **WHEN** the client is at legacy `旧公寓三楼走廊` and the player asks to go downstairs
- **THEN** the final record MUST use `3F_Stairwell` as its only location delta and mark the canonical transition

#### Scenario: Downstairs action continues one edge at a time
- **WHEN** the client is at `3F_Stairwell` and the player asks to go downstairs
- **THEN** the final record MUST use the directly adjacent `2F_Corridor` and MUST NOT claim arrival at `1F_Lobby`

### Requirement: Invalid model location deltas cannot corrupt unrelated turns

The final location guard MUST remove an unknown or non-traversable model-proposed location delta. If the player did not request movement, it MUST preserve the otherwise legal narrative; if the player did request movement and no one-edge transition can be confirmed, it MUST return a conservative no-movement result.

#### Scenario: Observation does not become an illegal movement rejection
- **WHEN** a player asks to inspect a hidden passage and the model attaches an unknown `304` doorway location
- **THEN** the final record MUST omit the location delta, retain the observation narrative and record the stripped-delta flag

#### Scenario: Unconfirmable multi-hop target is blocked
- **WHEN** a player asks to move directly from `3F_Stairwell` to `1F_Lobby`
- **THEN** the final record MUST omit `player_location`, MUST state that no confirmed location change occurred, and MUST not claim arrival

### Requirement: Canonical movement parsing is rollout-safe and post-generation

The system SHALL gate the new natural-language alias and directional synthesis behind `VERSECRAFT_ENABLE_CANONICAL_LOCATION_MOVEMENT`. It MUST run after candidate generation and MUST NOT add LLM calls, database IO, SSE frame changes, or first-status/first-token work.

#### Scenario: Rollout disabled
- **WHEN** canonical movement rollout is disabled
- **THEN** the system MUST not synthesize a location from a Chinese alias or direction, while preserving existing candidate location validation
