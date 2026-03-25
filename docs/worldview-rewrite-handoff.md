# 世界观重写说明（维护者交接）

## 本轮目标（已完成方向）

将「玩法规则」从独立菜单式说明，改写为可被叙事与检索消化的**结构化因果**：B1 稳定带、消化阶段楼层、原石—秩序—工资链、锚点与 12h 类推进、游荡商人与 7F 管理者张力等，在 registry 中有**可绑定字段**，在运行时通过 **packet** 注入，而非依赖单一巨型 truth 文本。

## 代码落点（权威来源）

| 层级 | 路径 | 作用 |
|------|------|------|
| 根真相 | `src/lib/registry/rootCanon.ts`、`apartmentTruth.ts` | 龙胃锚定、出口、回声体等不可变根因果 |
| 秩序与经济 | `src/lib/registry/worldOrderRegistry.ts` | B1、锚点、原石、夜读老人、游荡商人 → `gameplayBinding` |
| 楼层消化轴 | `src/lib/registry/floorLoreRegistry.ts` | 1F–7F `digestionStage`、`mainThreatMapping`、`systemNaturalization` |
| 揭露门闸 | `src/lib/registry/revealRegistry.ts`、`revealTierRank.ts` | surface / fracture / deep / abyss |
| 运行时拼装 | `src/lib/playRealtime/runtimeContextPackets.ts`、`worldLorePacketBuilders.ts`、`stage2Packets.ts` | 位置、信号、任务上下文 → JSON packet |
| 稳定 prompt 边界 | `src/lib/playRealtime/playerChatSystemPrompt.ts` | 仅保留地图与安全硬约束，事实走 registry |

更细的注入与 RAG 指纹见：`docs/world-canon-layering-v3.md`、`docs/registry-reveal-packets-architecture.md`。

## 验收口径（代码侧可证）

1. **B1**：`worldOrderRegistry` 中「迟滞稳定带」+ `playerChatSystemPrompt` 安全中枢表述 + `buildB1OrderPacket` 注入一致。
2. **原石—秩序闭环**：`useGameStore` 中原石/理智/楼层逻辑与 `WORLD_ORDER_CANON` 中「分配权」叙事对齐；高阶任务与 7F 在 `floorLoreRegistry` 的 `systemNaturalization` 中挂钩。
3. **锚点与推进**：`revealRegistry` 对 `reviveFastForward12h` 等信号有门闸；`playerWorldSignals` / `runtimeContextPackets` 解析锚点状态字符串。
4. **1F–7F 统一过程**：各层均有 `digestionStage` 与 `hiddenCausal`，不是仅怪物名列表。
5. **中长期伏笔**：根 canon（龙/夹层）+ `wandering_merchant` + `elder_steward` + 7F「结算调度」形成可扩展叙事轴，**不要求**本轮在玩法里全部兑现。

## 明确未在代码中「写完」的部分

- 剧情文案、任务脚本、NPC 对话的逐条润色仍依赖内容生产。
- 地图与关卡密度未在本轮扩张；registry 为后续内容预留钩子。
