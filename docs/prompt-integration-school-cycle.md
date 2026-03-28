# DM Prompt 与学制/高魅力 NPC：接入说明

## 为什么 stable prompt 只做边界强化

- **TTFT / KV 缓存**：`getStablePlayerDmSystemPrefix()` 是长前缀缓存热区；世界观长文进 stable 会线性抬高首 token 成本并稀释缓存命中。
- **防剧透与版本漂移**：真相若写死在 static 里，难以与 `maxRevealRank`、任务进度、世界标记同步；**以运行时 JSON packet + registry + RAG** 为单一可变事实源更安全。
- **职责划分**：stable 负责 **不可违背的叙事与 JSON 契约**；可变层负责 **本回合允许知道什么**。

## 真相主要从哪里来

| 层级 | 来源 |
|------|------|
| 硬规则与格式 | `playerChatSystemPrompt.ts` → `buildStablePlayerDmSystemLines()` |
| 本回合世界态 | `buildRuntimeContextPackets()` → 动态后缀中的 JSON 包 |
| 学制/校源/七锚（分档） | `school_cycle_arc_packet`、`school_source_packet`、`cycle_loop_packet`、`reveal_tier_packet` |
| 高魅力 NPC 双层与重连 | `major_npc_arc_packet`、`major_npc_relink_packet`、`team_relink_packet`，辅以 `key_npc_lore_packet.major_npc_bridge_hints` |
| 长 Lore 检索 | `runtimeLoreCompact`（非 minimal）、world knowledge bootstrap / RAG（由 route 既有链路注入） |

Stable 中仅增加 **极短** 小节【高魅力 NPC 与旧阵（硬边界）】与对【动态上下文声明】的一行扩展，**点名 packet 键名**以便模型对齐，**不展开设定正文**。

与需求条目的对应关系：

- **high-charisma NPC dual-identity rule** → 硬边界第 1 条（职能壳优先 + packet/reveal 才露深层）。
- **no instant party rule** → 硬边界第 2 条。
- **reveal-tied truth rule** → 动态上下文声明扩展 + 第 1 条中的 reveal_tier_packet。
- **xinlan-first-anchor rule** → 硬边界第 3 条（含第一牵引、禁止替其全盘剧透、勿让他人抢跑）。

## minimal / full context mode 一致性

- **full**：`contextMode !== "minimal"` 时 `buildRuntimeContextPackets` 使用较大 `maxChars`，并带上完整 `worldLorePackets` 与 stage 包等。
- **minimal**：仍通过 `worldLorePacketsCompact` 注入 **缩写** 子包（同一 schema 族，字段压缩），包含 `school_cycle_arc`、`major_npc_arc`、`cycle_loop`、`school_source`、`team_relink`、`major_npc_relink` 等，避免「minimal = 完全不知道边界」。
- **dynamic 后缀**：`buildDynamicPlayerDmSystemSuffix` 在 `runtimePackets` 非空时原样附加整段 JSON 文本；与 `contextMode` 无关，由 `buildRuntimeContextPackets` 内部决定体积。

## 快车道（fast lane）与空包

当 `enableLightweightFastPath` + `fastLaneSkipRuntimePackets` + `riskLane === "fast"` 时，`runtimePackets` 可为空字符串。此时 **不得**依赖 packet 字段做深叙事；stable 第 4 条要求模型 **不臆造** 七锚/校源/旧阵，待后续回合有包再对齐。

## 风险与性能控制

- 修改 stable 后建议 bump 环境变量 **`VERSECRAFT_DM_STABLE_PROMPT_VERSION`**，避免上游缓存旧前缀。
- 勿在 `route.ts` 的 prompt 拼装路径增加同步重计算或大段字符串拼接；packet 仍由 `buildRuntimeContextPackets` 单点构建。
- 脚本 `gen-player-chat-stable-prompt.mjs`：若 `route.ts` 中无 legacy `buildSystemPrompt`，**跳过生成**，以手写 `playerChatSystemPrompt.ts` 为准。

## 修改摘要（相对本改动前）

| 区域 | 修改前 | 修改后 |
|------|--------|--------|
| Stable | 仅泛化「运行时注入优先」「保密与揭露」 | 同上 + **点名 packet 键** + **四条**高魅力/旧阵/欣蓝/空包边界 |
| `route.ts` | 无注释说明 minimal 与 arc 包关系 | **注释**说明 compact 含 arc 子包及快车道兜底 |
| `gen-player-chat-stable-prompt.mjs` | 缺 `buildSystemPrompt` 时抛错 | **优雅退出**并警告，避免误覆盖手写文件 |
