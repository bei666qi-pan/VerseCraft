## ADDED Requirements

### Requirement: Harmless contact attempts preserve player agency
The authoritative DM turn SHALL treat an ordinary attempt to approach and greet or converse with a named person as a legal player action when contact fails only because the target is absent or unregistered. The system MUST NOT materialize the unavailable target or commit NPC state from that attempt.

#### Scenario: Named target is unavailable for a greeting
- **WHEN** the player attempts to walk over and greet a named person and the candidate response reports that nobody is present
- **THEN** the authoritative result has `is_action_legal: true`, preserves a no-contact consequence, and commits no relationship, NPC location, or NPC registration delta for the target

#### Scenario: Social action is independently prohibited
- **WHEN** the player requests coercion, forced affection, mind control, violence, or another independently illegal act involving a named person
- **THEN** the harmless-contact rule does not change the candidate's action legality

#### Scenario: Target disappears before contact
- **WHEN** the player attempts an ordinary greeting or conversation and the candidate narrative says the apparent target disappeared or is no longer visible before contact
- **THEN** the authoritative result has `is_action_legal: true` and commits no relationship, NPC location, or NPC registration delta for the target

#### Scenario: Contact narrative is removed by protocol sanitization
- **WHEN** a harmless contact attempt reaches finalization with `is_action_legal: false` only because the protocol guard removed a contaminated narrative
- **THEN** the authoritative result has `is_action_legal: true`, uses a deterministic no-contact fallback narrative, retains the protocol audit metadata, and commits no target-specific state
