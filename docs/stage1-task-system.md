# Stage 1 任务系统说明

## 模型

- `GameTaskV2`
- 类型：`main | floor | character | conspiracy`
- 状态：`active | completed | failed | hidden | available`
- 结构化奖励：原石/道具/仓库物品/解锁/关系变化

## 关键机制

- `new_tasks` / `task_updates` 走结构化 JSON 契约
- 服务端标准化与容错（防“叙事写了但状态没落地”）
- hidden task 条件激活
- NPC 主动发放节奏控制（好感、位置、冷却）
- 被拦截时生成自然叙事 fallback

## 关系联动

- 支持通过任务后果写入关系补丁
- `relationship_updates` 为优先结构化通路
- `worldConsequences` 作为兼容兜底

