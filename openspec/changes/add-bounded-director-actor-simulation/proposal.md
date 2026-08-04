# Proposal: add-bounded-director-actor-simulation

## Summary

在现有后台 World Director 上增加有界的 NPC 行动推演能力。

## Status

In Progress (Phase 3 of Narrative Chain Consolidation)

## Core Deliverables

1. **Actor Simulation Types** — `DirectorCastPlan`, `ActorSimulationInput`, `ActorProjection`, etc.
2. **Cast Selection** — 确定性纯函数，复用 `selectActiveNpcsForSocialTick()`
3. **Actor Input Builder** — epistemic filtering per NPC
4. **Projection Validator** — 纯函数，10 项检查
5. **Feature Flags** — `VERSECRAFT_ENABLE_ACTOR_SIMULATION` + mode switch
6. **World Engine Integration** — 适配现有 `runWorldEngineTick`

## Completed

- [x] Types: `src/lib/worldEngine/actorSimulation/types.ts`
- [x] Cast Selection: `src/lib/worldEngine/actorSimulation/castSelection.ts`
- [x] Input Builder: `src/lib/worldEngine/actorSimulation/buildActorInput.ts`
- [x] Validator: `src/lib/worldEngine/actorSimulation/validateProjection.ts` (10 tests pass)
- [x] Config: `src/lib/worldEngine/actorSimulation/config.ts`
- [x] Module Index: `src/lib/worldEngine/actorSimulation/index.ts`

## Remaining

- [ ] World Engine integration adapter
- [ ] Director Synthesis (merging projections into DirectorPlan)
- [ ] Telemetry integration
- [ ] Live gateway simulation call
