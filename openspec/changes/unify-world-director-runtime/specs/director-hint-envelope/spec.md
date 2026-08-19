## ADDED Requirements

### Requirement: Writer hints SHALL originate only from committed accepted envelopes
The system SHALL persist a `DirectorHintEnvelope` only from the final accepted Director set. The envelope MUST include exact scope, run/revision, validity turn window, phase, validated direction and priority constraints, registered references, source metadata, and lifecycle status. Rejected candidate content MUST NOT appear in snapshots, agenda, envelopes, or prompts.

#### Scenario: Entire candidate is rejected
- **WHEN** deterministic validation rejects every candidate item
- **THEN** no hint envelope is created for that run

#### Scenario: Candidate is partially accepted
- **WHEN** only a subset of candidate items passes every gate
- **THEN** the envelope contains only that accepted subset

### Requirement: Hint loading SHALL enforce exact scope and applicability
Prompt assembly SHALL query committed envelopes by `sessionId + worldId + mapId`, enforce lifecycle and turn-window applicability, and render only a bounded sanitized Writer direction block. Query failure or deadline expiry SHALL fail open to no hint.

#### Scenario: Same session exists in both worlds
- **WHEN** Dark Moon and Xingni share a session identifier and each has a committed hint
- **THEN** each Writer turn can load only the envelope matching its own world and map

#### Scenario: Hint expired before next turn
- **WHEN** the current turn lies outside an envelope's validity window
- **THEN** prompt assembly does not render that envelope

### Requirement: Hint receipts SHALL remain internal telemetry
The server MAY accept an internal `DirectorHintReceipt` containing known hint IDs and considered/applied/skipped status, but MUST validate it, record it only as structured append-only telemetry, and remove it from the player-visible final JSON.

#### Scenario: Writer returns a valid receipt
- **WHEN** a Writer candidate contains a receipt for the applicable committed hint
- **THEN** the server records validated receipt telemetry and the authoritative final omits the receipt

#### Scenario: Writer fabricates a hint ID
- **WHEN** a Writer candidate contains an unknown hint ID
- **THEN** the server discards the receipt and does not expose it in the final
