## ADDED Requirements

### Requirement: Deterministic combat only settles registered anomaly targets

The deterministic combat guard SHALL derive its settlement target only from active threat IDs that resolve in the authoritative anomaly combat registry. It SHALL ignore unknown IDs and SHALL never emit a weapon update, threat update, or conflict outcome for an unknown target.

#### Scenario: Active snapshot contains only an unknown threat ID

- **WHEN** the player requests an explicit combat action and the active threat snapshot contains no registry-resolved anomaly ID
- **THEN** the final DM result SHALL report that no registered combat target is available and SHALL contain no combat settlement delta or weapon wear

#### Scenario: Active snapshot contains both unknown and registered threat IDs

- **WHEN** the player requests an explicit combat action and the active threat snapshot includes an unknown ID followed by a registered anomaly ID
- **THEN** the guard SHALL settle only the registered anomaly and SHALL not reference the unknown ID as a world fact

#### Scenario: Candidate narrative denies a settled registered target

- **WHEN** a registered target receives deterministic combat settlement but the candidate narrative says the scene is empty, has no enemy, that the player attacks air, or that the player does not act
- **THEN** the final narrative SHALL be replaced by a target-consistent deterministic combat description and SHALL not deny the settled target or the committed player attack

### Requirement: Threat reconnaissance does not narrate unknown IDs as registered facts

The deterministic reconnaissance path SHALL describe only registry-resolved active threats. If none resolve, it SHALL state that no registered active threat is available and SHALL not generate a combat delta.

#### Scenario: Reconnaissance receives an unknown ID

- **WHEN** a non-combat reconnaissance action receives only an unknown active threat ID
- **THEN** the response SHALL not name or characterize that ID as an existing threat and SHALL leave combat state unchanged
