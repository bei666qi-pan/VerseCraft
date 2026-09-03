## Purpose

确保文本化战斗只对结构化、已登记的异常目标结算，避免模型描述将未知 ID 或虚构威胁写入游戏状态。本门禁同时保障武器耐久、伤害与死亡结算不会被纯叙事文本触发。

## Requirements

### Requirement: Deterministic combat only settles registered anomaly targets

The deterministic combat guard SHALL derive settlement only from validated structured combat fields or active threat IDs that resolve in the authoritative registry. It SHALL ignore unknown IDs and narrative-only combat language, and SHALL never emit weapon updates, health damage, sanity damage, threat updates, death, or conflict outcomes without registered mechanics evidence.

#### Scenario: Active snapshot contains only an unknown threat ID

- **WHEN** the player requests an explicit combat action and the active threat snapshot contains no registry-resolved anomaly ID
- **THEN** the final DM result SHALL report that no registered combat target is available and SHALL contain no combat settlement, damage, sanity, death, or weapon-wear delta

#### Scenario: Active snapshot contains both unknown and registered threat IDs

- **WHEN** the player requests an explicit combat action and the active threat snapshot includes an unknown ID followed by a registered anomaly ID
- **THEN** the guard SHALL settle only the registered anomaly and SHALL not reference the unknown ID as a world fact

#### Scenario: Candidate narrative denies a settled registered target

- **WHEN** a registered target receives deterministic combat settlement but candidate narrative denies the target or player action
- **THEN** final narrative SHALL be repaired or replaced with a target-consistent description while the deterministic settlement remains unchanged

#### Scenario: Narrative alone describes injury or panic

- **WHEN** structured candidate fields and deterministic mechanics contain no grounded damage or sanity result but prose contains injury or panic wording
- **THEN** the authoritative turn SHALL keep health, sanity, death, weapon, threat, and conflict state unchanged

### Requirement: Threat reconnaissance does not narrate unknown IDs as registered facts

The deterministic reconnaissance path SHALL describe only registry-resolved active threats. If none resolve, it SHALL state that no registered active threat is available and SHALL not generate a combat delta.

#### Scenario: Reconnaissance receives an unknown ID

- **WHEN** a non-combat reconnaissance action receives only an unknown active threat ID
- **THEN** the response SHALL not name or characterize that ID as an existing threat and SHALL leave combat state unchanged
