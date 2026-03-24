# Stage 1 架构说明

本文对应第一阶段已落地的“可玩闭环”基座，目标是稳健而非终局范式。

## 范围

- B1 安全中枢（服务节点 + 安全护栏）
- TaskV2（结构化任务 + 状态迁移 + NPC 主动发放护栏）
- 复活锚点（最近锚点 + 12h 快进 + 掉落转移）
- NPC 分层与关系状态基础
- DM Prompt 瘦身（stable prompt + runtime packets + retrieval）

## 核心设计

- **状态底座**：`RunSnapshotV2` 作为统一运行快照，挂载于 `saveSlots.data` 过渡承载。
- **兼容策略**：通过 snapshot migration/projection 保持旧档可读、旧页面可运行。
- **业务护栏优先**：B1 安全区伤害、服务执行、任务发放、复活流程由业务层兜底，不依赖 narrative 自觉。
- **提示词职责分离**：稳定规则放 `stable prompt`，高变化信息放 runtime packet + retrieval。

## 关键目录

- `src/lib/state/snapshot/*`
- `src/lib/registry/serviceNodes.ts`
- `src/lib/tasks/taskV2.ts`
- `src/lib/revive/*`
- `src/lib/playRealtime/*`
- `src/app/api/chat/route.ts`

