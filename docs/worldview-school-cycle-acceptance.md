# 世界观·学制循环收口验收（可编译 / 可跑 / 可回归 / 可扩写）

## 1. 目标与非目标

**目标**

- **双层正典落地**：辅锚六人在 registry 上同时具备「公寓职能壳」与「校源/辅锚深层」，由 `reveal` 档与 runtime packet 分轨交付，而非写进超长 stable。
- **主链路不断**：`src/app/api/chat/route.ts` 仍拼装 `buildRuntimeContextPackets` + `getStablePlayerDmSystemPrefix` + `composePlayerChatSystemMessages`；模型消费方式不变（JSON packet + 短边界句）。
- **防开局剧透**：`surface` 不注入七锚结构、校源深层定义、`school_source` 深行；`key_npc` / `major_npc_arc` 在 `fracture` 仍不出现 `resonanceSlot` 等硬编号。
- **可回归**：`pnpm test:unit` 含 `worldSchoolCycleAcceptance.test.ts`、`worldviewSchoolCycleClosure.test.ts`、`stage2GameplayLoop.test.ts`、`chatRouteContract.test.ts` 等与本主题相关断言。

**非目标（刻意不做及原因）**

- **不把完整设定塞进 stable**：避免 TTFT 与上下文爆炸；真相走 RAG、`truth:pkg:*` bootstrap 与 deep packet。
- **不大改任务系统 V2 全链路**：仅保留 `questHooks` 字符串与 relink 触发子串可对齐；结构化 `relationship_updates` 等留待后续。
- **不保证全仓库 `tsc --noEmit` 零告警**：历史 TS 债务与本轮解耦；**硬标准为与本主题相关的单测绿 + Next 构建策略以仓库脚本为准**。
- **不在此文档重复长篇剧情圣经**：细节见 `docs/world-packets-school-cycle.md`、`docs/prompt-integration-school-cycle.md`、`docs/player-experience-layer-school-cycle.md`、`docs/cycle-moon-flash-system.md`。

---

## 2. 本轮改动文件清单（收口相关）

| 类别 | 路径 |
|------|------|
| 时间/循环 | `src/lib/registry/cycleMoonFlashRegistry.ts` |
| 学制弧 / 切片 | `src/lib/registry/schoolCycleCanon.ts`、`schoolCycleIds.ts` |
| 检索 bootstrap 专条 | `src/lib/registry/schoolCycleRetrievalSeeds.ts` |
| 高魅力深层 | `src/lib/registry/majorNpcDeepCanon.ts`、`majorNpcRelinkRegistry.ts` |
| 旧阵/派对重连骨架 | `src/lib/registry/partyRelinkRegistry.ts`（与 relink packet 对齐） |
| Runtime 学制包 | `src/lib/registry/worldSchoolRuntimePackets.ts` |
| 玩家体验层事实 | `src/lib/registry/playerExperienceSchoolCycleRegistry.ts` |
| 揭示门闸 / 信号 | `src/lib/registry/revealRegistry.ts`、`playerWorldSignals.ts` |
| 世界弧 bootstrap | `src/lib/registry/worldArcBootstrapSlices.ts` |
| Runtime 拼装 | `src/lib/playRealtime/runtimeContextPackets.ts`、`worldLorePacketBuilders.ts`、`stage2Packets.ts` |
| Bootstrap / 映射 | `src/lib/worldKnowledge/bootstrap/registryAdapters.ts`、`coreCanonMapping.ts` |
| Prompt | `src/lib/playRealtime/playerChatSystemPrompt.ts`、`scripts/gen-player-chat-stable-prompt.mjs`（若使用） |
| 世界表 / profile | `src/lib/registry/world.ts`、`npcs.ts`、`npcProfiles.ts` |
| 主 API | `src/app/api/chat/route.ts`（`maxChars` full 现为 **4000**，与 compact 键序配合避免截断战术包） |
| 单测 | `worldSchoolCycleAcceptance.test.ts`、`worldviewSchoolCycleClosure.test.ts`、`runtimeContextPackets.test.ts`、`playerChatSystemPrompt.test.ts`、`majorNpcRelinkRegistry.test.ts`、`cycleMoonFlashRegistry.test.ts`（若有）、`chatRouteContract.test.ts`、`stage2GameplayLoop.test.ts` |
| 文档 | 本文；既有 `docs/world-packets-school-cycle.md` 等 |

---

## 3. 世界观新闭环总览

- **空间层**：耶里学校事故为碎片缘起侧叙事；如月公寓泡层为沿裂隙生长的收容表述，与 runtime `school_source_packet`（deep+）及 `truth:pkg:incident_yeliri_school` 对齐。
- **结构层**：七锚收容（主锚 + 六辅锚相位）仅在 **deep+** 档与专条中直述；`surface` 侧用传言/违和耦合替代点名。
- **时间层**：十日量级窗口、纠错型闪烁、龙月/暗月相位与 `cycle_time_packet`、`cycle_loop_packet` 数值位对齐；详见 `cycleMoonFlashRegistry` 与学制切片。
- **社会层**：高魅力六人为辅锚相位 + 职能壳；**非** instant party；重连由 `major_npc_relink_packet` + `team_relink_packet` 分阶段门闸表达。
- **知识层**：`buildRegistryWorldKnowledgeDraft` 注入 `truth:pkg:*`（`school_cycle_pkg` + `reveal_*`）、`cycle_moon` 源、`playerExperienceSchoolCycleRegistry` 实体，供 RAG 与 canon 映射双轨。

---

## 4. 六位高魅力 NPC 新闭环总览

**冻结 id 与顺序**（与 `MAJOR_NPC_IDS` / `SCHOOL_CYCLE_RESONANCE_NPC_IDS` 一致）：

`N-015` 麟泽 → `N-020` 灵伤 → `N-010` 欣蓝 → `N-018` 北夏 → `N-013` 枫 → `N-007` 叶。

每人具备：

- **表层**：`publicMaskRole`、`apartmentSurfaceDuty`、`npcProfiles` 中「公寓职能面 / 校源面」双段 `surfaceSecrets`。
- **深层**：`schoolIdentity`、`schoolWandererNote`、`residualEchoToProtagonist`、`resonanceSlot`（1–6 各占一位）、`wandererSubtype`（`apartment_wanderer` / `school_wanderer` / `residual_echo` 的有效组合）。
- **社交图**：`world.ts` 加载时 `patchMajorNpcSocialGraph` + profile merge 写入 `surfaceFixedLoreParagraph` 等，**不**再残留「静态占位 + 旧电梯工/诱饵/无面/钢琴亡灵」壳文案。

---

## 5. 玩家首次进入体验预期

- 初见六人：**场景职能**先成立（B1 边界、补给、登记、交易、7F、画室等），**不**默认全员旧友、**不**自动并队。
- 邻校与循环：多为**传言或环境压强**，非一次性百科。
- **欣蓝**：可呈现「验你、牵引你」的异常熟悉感，但 stable + surface packet **禁止**代她倾泻七锚全貌（见 `playerChatSystemPrompt` 边界句与 packet `antiDumpPolicy`）。
- 运行时 JSON：`reveal_tier_packet.maxRevealRank` 与各子包门闸一致；模型应服从 **reveal-first** 与 **no-instant-party**。

---

## 6. 欣蓝牵引 → 其余五人逐步重连的验证路径

1. **门闸数据源**：`majorNpcRelinkRegistry` 根据 `playerContext` / 图鉴 / `maxRevealRank` 计算 `entries` 与 `xinlanPivotOpen` 等；`majorNpcArcPacket` 在 `fracture+` 对欣蓝可出 `dutyEchoHint`（异常熟悉、非全知剧透）。
2. **牵引规则（摘要）**：多数角色 `ph=3` 常需欣蓝牵引或 deep 档；危机窗口可临时抬高并队许可（见 `partyRelinkRegistry` / relink 文档）。
3. **自动化**：`worldSchoolCycleAcceptance.test.ts`（packet + 欣蓝 fracture）、`majorNpcRelinkRegistry.test.ts`、`worldviewSchoolCycleClosure.test.ts`（欣蓝 `dutyEcho` + `deepEchoUnlocked`）。

---

## 7. Reveal 样例（期望行为）

| `maxRevealRank` | `school_cycle_arc` | `school_source` | `major_npc_arc`（邻近 N-010） | `key_npc`（结构化 hints） |
|-----------------|--------------------|-----------------|-------------------------------|---------------------------|
| surface | 无深层切片 id | `injected: false` | 无 `dutyEchoHint` / 校源 hint | 无 `resonanceSlot` |
| fracture | 可有违和/龙月等，**不**直给七锚定论 | 浅注入策略依实现 | 可有 `dutyEchoHint`、`relinkSignals` | 仍 **无** `resonanceSlot` |
| deep+ | 七锚、校源徘徊者、十日链等 | 深叙事行 | `schoolResidueHint`、`residualEchoHint` 等 | 含 `resonanceSlot`、`wandererSubtype` 等 |

单测：`worldSchoolCycleAcceptance.test.ts`、`worldviewSchoolCycleClosure.test.ts`。

---

## 8. 风险点

| 风险 | 说明与缓解 |
|------|------------|
| Runtime JSON 体积 | 学制子包增多后 full 串常 > 原 2.4k；已调高 route `maxChars`（full **4000**）、`buildRuntimeContextPackets` 默认 **4200**，且 **compact 截断路径**下将 `weapon_packet` / `forge_packet` / `tactical_context_packet` 提前，避免 `slice` 切掉 stage2 关键键。 |
| 快车道跳过 packets | `fastLaneSkipRuntimePackets` 时 stable 仍须约束臆造深层。 |
| RAG 深事实误检索 | 依赖 `reveal_*` tag 与查询门闸；运营侧 seed 后需抽检实体 tag。 |
| Content Spec 覆盖 NPC | `applyNpcProfileOverrides` 可改写 `NPCS.lore`；**验收以 `CORE_NPC_PROFILES_V2` 双层 `surfaceSecrets` + `NPC_SOCIAL_GRAPH` patch 为准**（见 closure 测试）。 |

---

## 9. 后续可扩写方向

- **任务进度结构化**：将 relink 触发从「标题子串」迁到稳定 task id / worldFlags，降低漏匹配。
- **微包快车道**：在 TTFT 约束下为 fast lane 增加「仅 reveal_tier + 一行 policy」可选路径。
- **UI / 队伍态**：在不改 JSON DM 契约前提下，用客户端表现 `team_relink_packet` 阶段（纯展示层）。
- **World event 与时间 digest**：把 `cycle_loop_packet` 的 `timeDigest` 与更多 playerContext 字段做确定性对账测试。

---

## 附录：如何跑验收测试

```bash
pnpm test:unit
# 或针对性：
pnpm exec tsx --test src/lib/registry/worldSchoolCycleAcceptance.test.ts
pnpm exec tsx --test src/lib/registry/worldviewSchoolCycleClosure.test.ts
pnpm exec tsx --test src/lib/playRealtime/stage2GameplayLoop.test.ts
pnpm exec tsx --test src/lib/playRealtime/chatRouteContract.test.ts
```

**后续内容生产清单**：[content-production-checklist-school-cycle.md](content-production-checklist-school-cycle.md)。
