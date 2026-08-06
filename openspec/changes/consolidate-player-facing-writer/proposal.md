# Proposal: consolidate-player-facing-writer

## Summary

把玩家可见叙事责任统一到单一 `Writer` 逻辑角色，同时保持 `control`（在线快判）和 `reasoner`（离线推演）的职责隔离。`main`/`enhance` 语义重叠被 `Writer` 收口，旧配置保持向下兼容。

## Motivation

当前 `main` 和 `enhance` 两个逻辑角色都参与玩家可见叙事生成，语义边界模糊。Phase 2 的目标不是全仓重命名，而是建立清晰的 `Writer` 能力 facade，在配置层和任务矩阵中保持旧部署兼容。

## Approach

- 在 `logicalTasks.ts` 中创建 `generateWriterTurn` facade（已完成，委托 `generateMainReply`）
- 在 `envCore.ts` 中解析 `AI_MODEL_WRITER`，未配置时回退 `AI_MODEL_MAIN`（已完成）
- 在 `taskPolicy.ts` 中 `WRITER` 已注册为合法逻辑角色（已完成）
- PLAYER_CHAT 永不选择 `reasoner`
- Writer prompt 明确：narrative 不是状态真相源

## Scope

- `logicalTasks.ts`: Writer facade
- `envCore.ts`: Writer role resolution + backward compat
- `taskPolicy.ts`: Writer role registration
- No database schema changes
- No SSE contract changes

## Status

Complete — code already in production with backward compat.

## Risk

低。Writer 是 `generateMainReply` 的语义别名，行为无变化。
