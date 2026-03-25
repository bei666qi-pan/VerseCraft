# VerseCraft 世界观分层（V3）

本版目标：让玩法系统被世界因果吞入，而非把世界设定堆成单一长文本。

## 四层 Canon 结构

1. **Immutable Root Canon**
   - 文件：`src/lib/registry/apartmentTruth.ts`、`src/lib/registry/worldCanon.ts`
   - 只保留不可变根因果：龙胃锚定、空间碎片、出口与守门人、回声体身份。

2. **Structured World Registries**
   - 文件：`src/lib/registry/world.ts`、`src/lib/registry/worldCanon.ts`、`src/lib/registry/serviceNodes.ts`
   - 存放楼层、节点、威胁、秩序、原石、锚点、服务节点、NPC 结构化资料。

3. **Reveal Tiers**
   - 文件：`src/lib/registry/worldCanon.ts`
   - 分为 `surface / fracture / deep / abyss`，按进度、关系、任务和楼层推进披露。

4. **Narrative Surface Layer**
   - 文件：运行时 packet + retrieval 注入链路
   - 玩家可见的是传言、局部真相、误导与可执行规则，而非一次性全真相。

## 系统与世界绑定

- B1：迟滞稳定带（幸存者秩序中枢，不是菜单大厅）。
- 复活：锚点重构机制（时间推进、掉落、态势变化有内因）。
- 原石：延缓消化与修复支付媒介（工资、交易、秩序权）。
- 主威胁：每层对应消化阶段，不再是随机刷怪。
- 夜读老人：秩序维护者 + 清场筛选者的悖论角色。

## 注入原则

- stable system prompt 只保留最小硬约束。
- 大部分世界事实走 registry / runtime packets / retrieval。
- 禁止回退到巨型 stable prompt。

## 运行时揭露门闸（Reveal gating）

- `inferMaxRevealRank(playerContext, playerLocation)`：只根据客户端同步状态串抬层，**不用**玩家自然语言提问抬层，避免剧透。
- `planWorldKnowledgeQuery` 将 `maxRevealRank` 写入检索 `fingerprint`，换档即缓存失效。
- `getRuntimeLore` 与 registry fallback 在 `buildLorePacket` 前对候选事实做过滤；若无合规候选则回退到仅 `surface` 层事实。
- 事实最低层级由标签 `reveal_surface` / `reveal_fracture` / `reveal_deep` / `reveal_abyss` 或 `factKey` 启发式（如 `core:apartment_system_canon`）标定。

## 相关维护文档

- `docs/worldview-rewrite-handoff.md` — 世界观重写交接与验收口径
- `docs/registry-reveal-packets-architecture.md` — Registry / reveal / packet 技术说明
- `docs/open-beta-compliance-upgrade.md` / `docs/legal-pages-upgrade.md` / `docs/operations-followup-checklist.md` — 合规与运营配合（与叙事架构独立但同轮交付）
