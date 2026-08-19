## MODIFIED Requirements

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

## ADDED Requirements

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
