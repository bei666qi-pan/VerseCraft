# Stage 1 存档与世界快照说明

## 核心结论

- 统一状态模型为 `RunSnapshotV2`
- 采用“挂载在 saveSlots.data”的过渡方案
- 保持本地 persist / 云存档 / hydrate 链路兼容

## 兼容策略

- 旧档读取时执行 defensive migration
- 快照缺字段时由 normalize 填默认值
- 对旧页面保留 projection 所需字段

## 必须持久化字段（阶段一）

- 玩家位置、属性、原石、行囊、仓库、图鉴
- time/day/hour/darkMoonStarted
- worldFlags / discoveredSecrets / anchorUnlocks
- task 列表与状态
- death/revive 上下文
- NPC 运行时位置与关系基础

## 非目标

- 阶段一不做拆表范式化
- 阶段一不把纯 UI 态写入世界快照

