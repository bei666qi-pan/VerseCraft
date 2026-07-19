## ADDED Requirements

### Requirement: Options-only semantic quality recognizes player-visible scene anchors

The options regeneration quality gate SHALL accept an otherwise valid, non-duplicate action when it is anchored either in the latest player-visible narrative or in a bounded list of player-visible scene anchors supplied by the client. The gate SHALL remain a pure function and SHALL NOT resolve internal IDs, read world knowledge, or perform IO.

#### Scenario: Recovery scene has structured but non-literal anchors
- **WHEN** a completed recovery turn identifies the visible scene anchors “电源室”, “老刘”, and “武器”, while the narrative does not repeat all three words
- **THEN** concrete generated actions referring to those anchors SHALL be eligible for acceptance under the existing duplicate, generic-action, and homogeneity checks

#### Scenario: No structured scene anchors are supplied
- **WHEN** the quality gate receives an empty scene-anchor list
- **THEN** its narrative-anchor behavior SHALL remain compatible with the existing guard

### Requirement: Contextual anchors do not bypass option safety and relevance rules

The semantic quality gate SHALL continue to reject generic, duplicate, highly similar, or unrelated options even when scene anchors are present.

#### Scenario: Unrelated destination remains rejected
- **WHEN** a scene provides “电源室”, “老刘”, and “武器” as anchors but an option directs the player to an unrelated basketball court
- **THEN** the option SHALL be rejected as unanchored or generic rather than accepted through contextual anchoring
