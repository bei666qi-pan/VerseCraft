## ADDED Requirements

### Requirement: Source-aware empty player-chat stream recovery

The `/api/chat` player-chat stream coordinator SHALL evaluate `EMPTY_CONTENT` recovery independently for each eligible fallback source. An empty result from one source MUST NOT consume the empty-content recovery allowance of a distinct source.

#### Scenario: Primary and fallback sources both return empty streams

- **WHEN** the primary player-chat source completes below the minimum visible-content threshold and the fallback source subsequently completes below that threshold
- **THEN** the coordinator evaluates the fallback source using its own bounded empty-content recovery allowance before selecting the terminal fallback

#### Scenario: Same source repeatedly returns an empty stream

- **WHEN** a player-chat source has already exhausted its empty-content recovery allowance for the current turn
- **THEN** the coordinator MUST NOT retry that same source again solely because it returned `EMPTY_CONTENT`

### Requirement: Bounded contract-preserving recovery

Source-aware empty-stream recovery SHALL remain bounded by the existing stream-source-round, interruption, and wall-clock reconnect limits. The route MUST preserve the existing SSE status and `__VERSECRAFT_FINAL__` envelope contract when no eligible recovery path remains.

#### Scenario: Recovery budget is exhausted

- **WHEN** the coordinator cannot select another eligible source within the existing recovery limits
- **THEN** `/api/chat` returns the existing parseable visible failure DM JSON through the final SSE frame
