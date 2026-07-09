# VerseCraft 任务系统 1+2+1 规则（V1）

本文件定义任务系统产品化规则：任务板从“后台调度展示”升级为“玩家行动导航器”。

## 目标

- 主线目标：同屏仅 1 条
- 人物委托：同屏最多 2 条
- 机会事件：同屏最多 1 条

总模型：**1+2+1**

## 表层与后台边界

- 表层只展示：主线、委托、机会事件
- 承诺/软线索默认不抢主槽，进入轻追踪
- 后台任务可继续存在，但不自动挤占行动板

## 任务分类规则

任务在兼容 `taskV2` 的基础上增加可选字段：

- `surfaceClass`: `mainline | commission | opportunity | background`
- `surfaceSlot`: `mainline | commission | opportunity | hidden`
- `surfacePriority`: `0..100`

缺省时由投影器推断：

1. `goalKind=main` -> 主线
2. `conversation_promise/soft_lead` -> 后台或轻追踪
3. 限时或调查/递送窗口 -> 机会事件
4. 其余正式可见任务 -> 人物委托

## 可见性原则

- 只有形成“玩家行动义务”的任务进入 1+2+1 主槽
- `conversation_promise` 与 `soft_lead` 默认不进入主槽
- `hidden` 与 `archived_hidden` 永不进玩家主板

## 排序优先级

同槽位排序综合：

1. 显式 `surfacePriority`
2. 是否 active
3. 风险信号（反噬/高风险/风险提示）
4. 引导强度
5. 奖励行动性（权限 > 路线推进 > 关系变化 > 情报）

## 与现有链路兼容

- `new_tasks` / `task_updates` 机制不变
- `resolveDmTurn` 收口机制不变
- starter tasks 不失效（缺省字段由推断补齐）
- 存档兼容：新增字段均为可选

## 代码落点

- 数据结构兼容：`src/lib/tasks/taskV2.ts`
- 投影与槽位策略：`src/lib/play/taskBoardUi.ts`
- UI 消费模型：`src/features/play/components/PlayNarrativeTaskBoard.tsx`

