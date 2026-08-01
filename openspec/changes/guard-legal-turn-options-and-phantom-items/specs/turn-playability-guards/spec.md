## ADDED Requirements

### Requirement: Legal gameplay turns remain actionable
The authoritative DM turn SHALL contain executable options when the action is legal, the player is alive, and ordinary gameplay is expected to continue.

#### Scenario: Candidate exploration result omits options
- **WHEN** a legal non-terminal exploration candidate reaches production finalization with no usable options
- **THEN** the authoritative final result contains bounded executable fallback options

#### Scenario: Illegal or terminal result omits options
- **WHEN** an illegal action or terminal death result reaches production finalization without options
- **THEN** the system does not invent continuation options solely to satisfy the legal-turn guard

### Requirement: Item actions are grounded in authoritative inventory
The authoritative DM turn MUST NOT accept, award, consume, or narratively materialize an item that the player explicitly identifies as never owned and that is absent from authoritative inventory state.

#### Scenario: Player attempts to use a nonexistent key
- **WHEN** the player attempts to use a key explicitly described as never owned and authoritative inventory contains no such key
- **THEN** the authoritative turn rejects or safely degrades the action and commits no phantom-item delta

#### Scenario: Ordinary exploration without item use
- **WHEN** the player performs an exploration action without claiming use of an absent item
- **THEN** the inventory guard does not change the action's legality or valid state deltas

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

### Requirement: Empty input is rejected through the realtime envelope
An empty or whitespace-only player action SHALL be rejected before model execution and SHALL remain parseable by SSE clients.

#### Scenario: Empty normal-turn request
- **WHEN** a normal chat request contains an empty player message
- **THEN** the response is `text/event-stream`, contains an authoritative final DM payload with `is_action_legal: false` and `consumes_time: false`, and does not invoke the model
