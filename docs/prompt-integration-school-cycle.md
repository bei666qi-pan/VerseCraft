# Prompt 集成：学制 / 高魅力 NPC（Stable 边界 + Runtime）

本文说明 **player 对话主模型** 在新世界观下的 **prompt 分层**：为何 stable 只做边界、事实从哪来、minimal/full 与快车道如何一致，以及性能与风险。

---

## 1. 为什么 stable prompt 只能做边界增强

| 原因 | 说明 |
|------|------|
| **TTFT / KV 缓存** | `getStablePlayerDmSystemPrefix()` 是长前缀；塞入大段 lore 会膨胀首包、削弱缓存命中与可预测性。 |
| **防剧透与版本漂移** | 真相随任务、标记、`reveal_tier` 变化；写死在 stable 里易与当回合 packet 冲突。 |
| **单一事实源** | 设定正文在 `registry`、检索种子、`buildRuntimeContextPackets` 子包中维护；prompt 只声明 **服从关系**。 |

因此 stable **不**承担「世界观百科」，只承担 **不可违背的叙事与格式边界**。

---

## 2. 真相事实来自哪些地方

优先级（与 stable 文案一致）：**运行时 JSON packet / retrieval / 控制层** > 静态记忆 > 模型臆测。

| 类型 | 来源 |
|------|------|
| 揭露档位 | `reveal_tier_packet`（由 `playerContext` 解析 + `revealRegistry` 门闸） |
| 高魅力六人 | `major_npc_arc_packet`、`major_npc_relink_packet`、`team_relink_packet`；`key_npc_lore_packet.major_npc_bridge_hints` |
| 学制/校源/循环 | `school_cycle_arc_packet`、`school_source_packet`、`cycle_loop_packet`、`cycle_time_packet` |
| 指针 | `worldview_packet.structuredSchoolCycleRefs`（仅包名，无正文） |
| 长文与专条 | RAG / `registryAdapters` / `coreCanonMapping` 种子（检索侧按 reveal 过滤） |

详见 `docs/world-packets-school-cycle.md`、`docs/cycle-moon-flash-system.md`。

---

## 3. Stable 中的四条命名边界（修改要点）

在 `src/lib/playRealtime/playerChatSystemPrompt.ts` 的 `buildStablePlayerDmSystemLines()` 中，将原「高魅力 NPC 与旧阵」长条合并为 **短标签边界**（**非 lore 段落**）：

| 标签 | 含义 |
|------|------|
| **dual-identity** | 先职能壳，深层仅当 `reveal_tier_packet` + 对应子包允许。 |
| **no-instant-party** | 重连渐进，禁止一见熟、默认跟队、一口旧队友。 |
| **reveal-first** | 深层真相以 packet/retrieval 为准，无包不编。 |
| **xinlan-anchor** | N-010 可熟悉与牵引，禁止代她剧透根因/七锚/通关链。 |

另有一条 **兜底**：**minimal / full / 快车道** 均适用；**快车道省略 lore JSON** 时仍禁止六人初见即全盘相熟。

「动态上下文声明」一句保留 **packet 名索引**，不展开设定正文。

---

## 4. minimal / full mode 如何保持一致

实现位置：`src/app/api/chat/route.ts` → `contextMode`（fast + slimming 时为 `minimal`）→ `buildRuntimeContextPackets({ contextMode, maxChars })`。

| 模式 | runtime 行为 |
|------|----------------|
| **full** | 完整 `worldLorePackets` + 较大 `maxChars`（由 route 配置）。 |
| **minimal** | `worldLorePacketsCompact`（缩写键名、截断列表），仍含 **reveal_tier、school_cycle_arc、major_npc_arc、cycle_loop、school_source、team_relink、major_npc_relink、cycle_time** 等。 |

**一致性的保证**：

- **同一套 stable 四条边界** 不区分模式，避免 minimal 下模型「放飞」。
- **同一套门闸**（`reveal_tier`）仍注入 compact 包，叙事深度由档位约束，而非由 prompt 体积替代。

---

## 5. 快车道（fast lane）与空包

当 `AI_CHAT_FASTLANE_SKIP_RUNTIME_PACKETS=true`（默认）且 **lightweight fast path** 命中时，`runtimePackets` 可能为 **空字符串**（见 `route.ts` `shouldSkipRuntimePacketsForFastLane`）。

此时：

- **stable 末条** 仍禁止六人初见即全盘相熟、禁止用「记忆恢复」代写全套真相。
- **不**在 route 中为此重复大段 lore（避免抵消 TTFT 优化）。

若业务上希望快车道也带缩写包，可将 `fastLaneSkipRuntimePackets` 设为 `false`（以环境变量为准），代价是动态 token 与拼装耗时上升。

---

## 6. 风险与性能控制

| 风险 | 缓解 |
|------|------|
| Stable 过长 | 仅用短句边界 + packet 名索引；设定走 registry/packet。 |
| minimal 写歪六人 | 与 full 共用四条边界 + compact 仍含 arc/relink/reveal。 |
| 快车道空包乱编 | stable 明确「空包仍遵守边界」。 |
| 缓存陈旧 | 改 stable 后设置 **`VERSECRAFT_DM_STABLE_PROMPT_VERSION`**。 |

**未改动**：JSON 输出契约、SSE 形状、`sanitizeMessagesForUpstream`、options/regen/settlement guard 等逻辑；本次仅改 stable 字符串与注释。

---

## 7. 修改前后差异摘要

| 项目 | 修改前 | 修改后 |
|------|--------|--------|
| 高魅力段落 | 四条编号说明，与动态声明部分重复 | 合并为 **四条命名边界 + 快车道兜底**，动态声明略收紧 |
| 快车道 | 注释指向「第 4 条」 | 注释指向 **「四条边界」末条** |
| `gen-player-chat-stable-prompt.mjs` | 仅 warn | 头注释说明 **手维护权威** + **VERSION bump** |
| `playerChatSystemPrompt.ts` 文件头 | 仅提脚本 | 明确 **VERSION bump** 与勿被脚本覆盖 |

---

## 8. 相关代码入口

- Stable 行：`src/lib/playRealtime/playerChatSystemPrompt.ts` → `buildStablePlayerDmSystemLines`、`getStablePlayerDmSystemPrefix`
- 动态后缀：`buildDynamicPlayerDmSystemSuffix`（`runtimePackets` 仍由 route 传入）
- Route 组装：`src/app/api/chat/route.ts`（`contextMode`、`buildRuntimeContextPackets`、`shouldSkipRuntimePacketsForFastLane`）

---

*若需加长设定，请改 registry / packet / RAG seed，而不是 stable 段落。*
