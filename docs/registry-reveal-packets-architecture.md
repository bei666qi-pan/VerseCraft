# Registry / Reveal Tiers / Runtime Packets 架构说明

## 为何不是「单一大 truth」

单一长文本会导致：全量剧透、难以按进度裁剪、与玩法状态不同步。当前架构将事实拆为：

1. **不可变根**（`rootCanon` + `apartmentTruth` 拼装块）
2. **结构化条目**（楼层、秩序、异常体 ID 绑定）
3. **揭露等级**（`reveal_surface` … `reveal_abyss` 或等价 rank）
4. **运行时 packet**（随位置、锚点、任务、NPC 邻近度变化的小块 JSON）

## 数据流（简图）

```
registry TS 模块
    → world knowledge / RAG fingerprint（含 maxRevealRank）
    → buildLorePacket / buildB1OrderPacket / stage2 threat-service-weapon packets
    → 合并进 runtime context → 模型侧 consumption
```

## 关键模块

- **`worldCanon.ts`**：聚合导出（兼容旧 import 路径）。
- **`revealRegistry.ts`**：按 `PlayerWorldSignals` 等条件决定可披露层级与策略文案。
- **`runtimeContextPackets.ts`**：从 `playerContext` 字符串与 `playerLocation` 解析信号，挂载 `b1_order_packet` 等。
- **`stage2Packets.ts`**：威胁、服务节点、武器、锻造等与楼层/异常体对齐的快照。

## 与「优于单一大 truth」对应的工程事实

- 同一会话可根据楼层切换 packet 子集，而不重写整份设定。
- 测试文件 `runtimeContextPackets.test.ts` 对长任务列表、锚点串等有边界用例，避免上下文爆炸。
- 揭露门闸文档见 `docs/world-canon-layering-v3.md` 第四节。

## 维护注意

- 新增楼层事实请改 `floorLoreRegistry` 与 `ANOMALIES` 等一致源，避免在 prompt 里硬编码。
- 修改 `playerContext` 锚点文本格式时，需同步 `ANCHOR_RE`（`playerWorldSignals.ts`、`runtimeContextPackets.ts`）。
