# Turn Playability Guards

## Purpose

Define deterministic production safeguards that keep authoritative player turns actionable, inventory-grounded, and compatible with the realtime SSE contract.

## Requirements

### Requirement: Legal gameplay turns remain actionable
The authoritative DM turn SHALL contain executable options when the action is legal, the player is alive, and ordinary gameplay is expected to continue.

#### Scenario: Candidate exploration result omits options
- **WHEN** a legal non-terminal exploration candidate reaches production finalization with no usable options
- **THEN** the authoritative final result contains bounded executable fallback options

#### Scenario: Illegal or terminal result omits options
- **WHEN** an illegal action or terminal death result reaches production finalization without options
- **THEN** the system does not invent continuation options solely to satisfy the legal-turn guard

### Requirement: Item actions are grounded in authoritative inventory
The authoritative DM turn MUST NOT accept, award, consume, use, or narratively materialize an item that the player explicitly attempts to use and that is absent from authoritative inventory or the current world's registered usable-item set. Item-action detection MUST use the player's action rather than narrative prose and MUST preserve ordinary exploration involving scene props.

#### Scenario: Player attempts to use a nonexistent key
- **WHEN** the player explicitly attempts to use a key and authoritative inventory contains no such key
- **THEN** the authoritative turn rejects or safely degrades the action and commits no phantom-item, damage, or conflict delta

#### Scenario: Player attempts to attack with a nonexistent laser sword

- **WHEN** the player says they use a laser sword to attack but no matching authoritative or registered usable item exists
- **THEN** the turn MUST NOT narrate successful use and MUST commit no item consumption, weapon wear, damage, or conflict result

#### Scenario: Ordinary exploration without item use
- **WHEN** the player performs exploration or narrative describes an ordinary scene prop without an explicit player-use action
- **THEN** the inventory guard MUST NOT change action legality or valid state deltas solely because that prop is absent from inventory

### Requirement: Natural-language movement resolves one registered adjacent edge

The authored-location guard MUST resolve movement only from the player action, current authoritative location, and registered world graph. Normalized aliases such as a unique adjacent room number MAY resolve to one canonical node; prose MUST NOT provide or override movement state.

#### Scenario: Unique adjacent room number

- **WHEN** the player says `进入302` and exactly one adjacent registered location maps to room 302
- **THEN** the turn MAY commit that single canonical movement edge

#### Scenario: Unique adjacent Chinese location alias

- **WHEN** the player requests a registered Chinese alias such as `楼梯间` and exactly one adjacent node owns that alias
- **THEN** the turn MAY commit that single canonical movement edge and MUST discard prose that falsely denies the verified traversal

#### Scenario: Unknown or non-adjacent room number

- **WHEN** the requested room is unknown, in another floor without a registered edge, or not adjacent
- **THEN** the turn MUST leave location unchanged and MUST NOT infer movement from generated prose

#### Scenario: Ambiguous alias

- **WHEN** more than one adjacent node matches a normalized action alias
- **THEN** the turn MUST not choose a destination arbitrarily

### Requirement: Structured NPC writes require canonical authority

Every NPC identifier written to relationships, locations, memory, codex, or other turn state MUST resolve in the current world, scene, or session authority set. Unregistered described people MAY appear only as identity-unconfirmed, non-interactive scene figures and MUST commit no NPC state.

#### Scenario: Placeholder or alias NPC id

- **WHEN** a candidate emits an unregistered id such as a placeholder, prose alias, or unknown handle
- **THEN** all structured writes for that id MUST be stripped and audited

#### Scenario: Registered scene NPC

- **WHEN** a canonical NPC id is authorized for the current world and scene and its delta passes existing epistemic and relation validation
- **THEN** the authority gate MUST preserve that valid NPC write

#### Scenario: Registered codex id has a forged identity

- **WHEN** a codex update pairs a canonical entity id with a name or type that conflicts with the current world's registry
- **THEN** the update MUST be stripped and audited
- **AND** omitted presentation fields MAY be filled only from the canonical registry

#### Scenario: Disembodied dialogue has no authorized actor

- **WHEN** no NPC is present and prose attributes direct dialogue only to an unidentified voice behind a door, wall, or other hidden boundary
- **THEN** the dialogue MUST be stripped or replaced with a neutral non-interactive observation
- **AND** explicit non-actor audio such as a recording, broadcast, telephone, or intercom MAY remain

### Requirement: Turn guards preserve realtime contracts
The production guards SHALL preserve the existing `/api/chat` SSE envelope and SHALL run without network, database, retrieval, or model calls.

#### Scenario: Guarded result is emitted
- **WHEN** either guard corrects a candidate DM result
- **THEN** the corrected result is emitted through the existing `__VERSECRAFT_FINAL__` frame with the existing DM JSON shape

### Requirement: Dialogue approach is not rejected as traversal
The authored-location guard SHALL treat explicit dialogue as the dominant intent when an approach verb only identifies the person being addressed.

#### Scenario: Player walks toward an NPC to chat
- **WHEN** the player says they walk toward an NPC and explicitly asks to talk or chat
- **THEN** the location guard does not reject the action solely because the NPC name is not a registered adjacent location

### Requirement: Harmless contact attempts preserve player agency
The authoritative DM turn SHALL treat an ordinary attempt to approach and greet or converse with a named person as a legal player action when contact fails only because the target is absent or unregistered. The system MUST NOT materialize the unavailable target or commit NPC state from that attempt.

#### Scenario: Named target is unavailable for a greeting
- **WHEN** the player attempts to walk over and greet a named person and the candidate response reports that nobody is present
- **THEN** the authoritative result has `is_action_legal: true`, preserves a no-contact consequence, and commits no relationship, NPC location, or NPC registration delta for the target

#### Scenario: Named target disappears before contact
- **WHEN** the player attempts an ordinary greeting or conversation and the candidate narrative says the apparent target disappeared or is no longer visible before contact
- **THEN** the authoritative result has `is_action_legal: true` and commits no relationship, NPC location, or NPC registration delta for the target

#### Scenario: Contact reaches the wrong person
- **WHEN** the player attempts an ordinary conversation with a named person and the candidate narrative explicitly says the person encountered is not that named target
- **THEN** the authoritative result has `is_action_legal: true`, preserves the wrong-person consequence, and commits no relationship, NPC location, or NPC registration delta for the unavailable target

#### Scenario: Resident denies the named target exists
- **WHEN** the player searches for a named person to ask for information and the candidate narrative explicitly reports `没这人` or an equivalent no-target outcome
- **THEN** the authoritative result has `is_action_legal: true`, preserves the failed-contact consequence, and commits no NPC state for the unavailable target

#### Scenario: Direct inquiry cannot reach or identify the target
- **WHEN** the player directly asks a named person for information and the candidate narrative reports an empty corridor or an explicit inability to locate, confirm, or identify whom to ask
- **THEN** the authoritative result has `is_action_legal: true`, preserves the failed-contact consequence, and commits no NPC state for the unavailable target

#### Scenario: Entity hard gate replaces unavailable-contact prose
- **WHEN** a harmless named-target contact attempt is rejected only after entity governance emits its audited `safe_fallback + block_commit + entity_hard_gate` result
- **THEN** the authoritative result has `is_action_legal: true`, preserves the safe fallback narrative, and commits no relationship, NPC location, or NPC registration delta

#### Scenario: Contact narrative is removed by protocol sanitization
- **WHEN** a harmless contact attempt reaches finalization with `is_action_legal: false` only because the protocol guard removed a contaminated narrative
- **THEN** the authoritative result has `is_action_legal: true`, uses a deterministic no-contact fallback narrative, retains the protocol audit metadata, and commits no target-specific state

#### Scenario: Social action is independently prohibited
- **WHEN** the player requests coercion, forced affection, mind control, violence, or another independently illegal act involving a named person
- **THEN** the harmless-contact rule does not change the candidate's action legality

### Requirement: Empty input is rejected through the realtime envelope
An empty or whitespace-only player action SHALL be rejected before model execution and SHALL remain parseable by SSE clients.

#### Scenario: Empty normal-turn request
- **WHEN** a normal chat request contains an empty player message
- **THEN** the response is `text/event-stream`, contains an authoritative final DM payload with `is_action_legal: false` and `consumes_time: false`, and does not invoke the model
