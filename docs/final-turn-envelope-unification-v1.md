# VerseCraft 最终回合统一收口（V1）

本次工程改造目标：不破坏现有 SSE/旧字段消费的前提下，把服务端最终提交形态统一为高层 changes 出口。

## 当前链路问题（改造前）

- `route.ts` 内多轮补丁后，前端主要消费散字段（`new_tasks/task_updates/...`）
- 同一语义在不同字段出现，前端需要猜测与拼装
- 冲突结果、任务推进、世界状态变化缺少统一高层出口

## 统一后最终结构（新增高层字段）

- `narrative`
- `turn_mode`
- `options`（兼容 legacy）
- `task_changes`
- `relation_changes`
- `conflict_outcome`
- `loot_changes`
- `clue_changes`
- `world_state_changes`
- `ui_hints`

说明：旧字段完整保留，新字段是“统一消费入口”。

## 兼容策略

1. SSE 传输不变：继续由 `__VERSECRAFT_FINAL__` 下发最终 payload  
2. 旧字段不删：`new_tasks/task_updates/...` 仍保留  
3. 新字段由 resolver 同步生成，保证与旧字段同源一致  
4. 前端可分阶段切换到新字段优先消费，旧字段兜底

## 已下沉到 resolver 的收口逻辑

- 任务新增/更新统一进入 `task_changes`
- 关系更新统一进入 `relation_changes`
- 掉落与消耗统一进入 `loot_changes`
- 线索更新统一进入 `clue_changes`
- 世界状态变化统一进入 `world_state_changes`
- `combat_summary` 归一到 `conflict_outcome`

## 后续可继续清理的冗余点

1. `route.ts` 中 options 再生与质量门控可继续收敛为单阶段  
2. 前端 `page.tsx` 可逐步改为仅消费 high-level changes，再 fallback 旧字段  
3. `combat_summary` 写回路径可进一步标准化为固定结构，减少字符串分支  
4. `route.ts` 多次 `resolveDmTurn` 可在流程稳定后减少到更少轮次

