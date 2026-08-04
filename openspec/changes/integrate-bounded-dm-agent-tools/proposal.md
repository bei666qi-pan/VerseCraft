# Proposal: integrate-bounded-dm-agent-tools

## Summary

将受限 DM Agent + Tool Calling 能力以"workflow over agent"方式接入 VerseCraft 在线回合链路，使 DM 能够对任务、锻造、战斗等明确 mechanics intent 通过工具调用执行领域规则，并将结果汇入现有 resolveDmTurn → commitTurn → __VERSECRAFT_FINAL__ 主链。

## Motivation

当前 DM 对所有玩家行动都走纯叙事路径，即使玩家明确表达了"我要锻造一把武器"或"我要接受这个任务"的意图，DM 也只能用自然语言描述结果，无法真正改变游戏状态。Tool Calling 可以让 DM 在受控条件下调用领域规则，实现真正的状态变更。

## Approach

- 复用并完善现有通用 `runToolLoop`（有界循环、超时、取消、并行读/串行写）
- 工具执行结果必须转换为标准 `StateDelta` 字段，重新汇入 `normalizePlayerDmJson` → `applyNpcConsistencyPostGeneration` → `validateNarrative` → `resolveDmTurn` → `commitTurn` → `__VERSECRAFT_FINAL__`
- 普通叙事、观察、闲聊不进入 Agent Loop
- Feature Flag `VERSECRAFT_ENABLE_DM_AGENT` 控制，默认关闭

## Scope

- 第一批工具：任务（get_active_quests, issue_quest, update_quest_progress）、锻造（inspect_forge_options, forge_weapon）、战斗（get_combat_state, start_combat, resolve_combat_action）
- 只读工具：get_player_state, get_inventory, get_world_context
- Tool Loop 基础设施（Tool Registry, Schema Validator, 超时/取消/并行/权限）
- /api/chat 正确集成（不绕过现有 final hooks）
- 测试覆盖

## Risks

- `/api/chat` 复杂度增加
- 延迟预算（mechanics lane 需控制总预算 ≤ 20s p95）
- 状态一致性（双重写入风险）

## Status

In Progress
