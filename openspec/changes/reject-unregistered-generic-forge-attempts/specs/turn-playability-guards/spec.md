## MODIFIED Requirements

### Requirement: Generic unregistered forge attempts must not mutate state

When the player explicitly attempts to create a weapon without naming a registered forge recipe or providing authoritative structured forge prerequisites, the server SHALL return a valid final DM result without awarding an item, consuming materials, deducting currency, or calling the narrative model.

#### Scenario: Claimed materials do not authorize an unregistered sword recipe

- **WHEN** the player says `我有充足的材料，锻造一把精良长剑。`
- **AND** the structured state does not establish a registered recipe execution
- **THEN** the action is rejected in a valid final DM envelope
- **AND** awarded and consumed item lists are empty
- **AND** currency does not change
