# Proposal: add-bounded-director-actor-simulation

> **Archived 2026-09-02 — superseded.** 独立 Actor 模型调用已由确定性的
> `ActorContextProjector` 与单次 `WorldDirectorWorkflow` 取代。下列清单仅为历史设计，
> 未经本次重构门禁重新验证，不代表当前实现状态。

> **Status: Remaining work absorbed (not archived).** `unify-world-director-runtime` owns production integration, dual-world scope, defaults, and verification.

## Summary

在现有后台 World Director 上增加有界的 NPC 行动推演能力：从当前重要 NPC 中选择最多 3 个角色，按各自认知边界推演行动候选，经过纯函数 validator 和 director synthesizer 后，将安全结果注入 reasoner context。

## Status

Complete — Phase 3 of Narrative Chain Consolidation

## Deliverables

| # | Deliverable | File |
|---|-------------|------|
| 1 | Type system | `types.ts` (246 lines) |
| 2 | Cast selection | `castSelection.ts` (127 lines) |
| 3 | Input builder | `buildActorInput.ts` (119 lines) |
| 4 | Validator | `validateProjection.ts` (200 lines) |
| 5 | Feature flags | `config.ts` (75 lines) |
| 6 | LLM simulator | `actorSimulator.ts` (360 lines) |
| 7 | Director synthesizer | `directorSynthesizer.ts` (340 lines) |
| 8 | World engine integration | `integration.ts` + `engine.ts` |
| 9 | Module index | `index.ts` |
| 10 | Tests | 40 tests, 0 failures |

## Test Evidence

- validateProjection: 10 tests, 0 failures
- actorSimulator: 19 tests, 0 failures
- directorSynthesizer: 11 tests, 0 failures
- TypeScript: 0 errors
- ESLint: 0 errors, 0 warnings

## Feature Flags (All Default OFF)

- `VERSECRAFT_ENABLE_ACTOR_SIMULATION=false`
- `VERSECRAFT_ACTOR_SIMULATION_MODE=batch_shadow`
