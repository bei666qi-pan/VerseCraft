## Context

The failed live turn ended in 9.4 seconds with no final frame and no parsed DM JSON; it did not hit the 120-second live-request timeout. The action was `我有充足的材料，锻造一把精良长剑。`, while the submitted client snapshot contained no registered forge location, operator, recipe, inventory, or currency evidence.

## Decisions

1. Classify only explicit generic weapon creation language (`锻造/打造/制作` plus a weapon noun) that does not identify a registered `forge_*` recipe.
2. Resolve it in `buildDeterministicServiceTurn`, the production zero-model adjudication path already used by authored forge operations.
3. Mark the operation illegal, consume no time or resources, award no items, and explain that a registered forge recipe and structured prerequisites are required.
4. Keep registered B1 recipe execution and quote behavior unchanged.

## Risks / Trade-offs

- A broad forge classifier could intercept narrative discussion. Mitigation: require an explicit creation verb and weapon-result noun; exclude registered recipe commands.
- A player may possess materials described only in prose. The structured snapshot remains authoritative; prose claims cannot establish inventory or a recipe.

## Migration Plan

No migration is required. Rollback is removal of the narrow deterministic branch.
