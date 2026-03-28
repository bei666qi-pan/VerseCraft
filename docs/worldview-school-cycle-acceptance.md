# 世界观重构验收：学校泄露 · 七锚循环 · 校源徘徊者 · 高魅力重连

## 1. 目标与非目标

**目标**

- 在 **registry / runtime packet / reveal 门闸 / bootstrap / stable prompt 边界** 上，统一「辅锚六人 = 公寓职能壳 + 校源残响」的双层叙事，并支持 **旧闭环渐进重连**。
- **可编译、可运行**：主链路 `chat/route` 仍拼装 `buildRuntimeContextPackets`；模型通过 JSON packet + 短 stable 边界消费设定。
- **防开局剧透**：`maxRevealRank === surface` 时不注入七锚/泄露/校源定义等深层切片。

**非目标（本轮刻意不做的）**

- 不把完整世界观写进 stable prompt 或单文件超长文案。
- 不改造任务系统 V2 全链路、不强制新增结构化 `relationship_updates` 字段。
- 不保证全仓库 `tsc --noEmit` 零错误（仓库内另有历史 TS 债务）；**本轮验收以与本主题相关的 `tsx --test` 单测与主链路行为为准**。

---

## 2. 改动文件清单（按层）

| 层级 | 文件 |
|------|------|
| Registry / Canon | `schoolCycleCanon.ts`、`schoolCycleIds.ts`、`majorNpcDeepCanon.ts`、`majorNpcRelinkRegistry.ts`、`worldSchoolRuntimePackets.ts`、`worldArcBootstrapSlices.ts`、`revealRegistry.ts`、`playerWorldSignals.ts` |
| Runtime packet | `runtimeContextPackets.ts`、`worldLorePacketBuilders.ts`、`stage2Packets.ts` |
| Bootstrap / Core canon | `registryAdapters.ts`、`coreCanonMapping.ts` |
| Prompt | `playerChatSystemPrompt.ts`、`scripts/gen-player-chat-stable-prompt.mjs` |
| Route | `src/app/api/chat/route.ts`（注释与既有拼装） |
| 测试 | `majorNpcRelinkRegistry.test.ts`、`runtimeContextPackets.test.ts`、`playerChatSystemPrompt.test.ts`、`worldSchoolCycleAcceptance.test.ts` |
| 文档 | `docs/party-relink-system.md`、`docs/world-packets-school-cycle.md`、`docs/prompt-integration-school-cycle.md`、本文 |

---

## 3. 兼容性说明

- **NPC id**：辅锚六人仍为 `N-015, N-020, N-010, N-018, N-013, N-007`（与 `SCHOOL_CYCLE_RESONANCE_NPC_IDS` 集合一致）。
- **JSON 契约**：DM 输出仍为单对象 JSON；SSE / options regen / guard 链路未改签名。
- **B1 服务**：`serviceNodes` 中 `B1_SafeZone` 等节点与 `svc_b1_*` id 保持；验收单测断言 `svc_b1_anchor`、`svc_b1_gatekeeper` 仍存在。
- **Quest hooks**：`npcProfiles.ts` 中六人 `questHooks` 仍为非空字符串数组；与 `majorNpcRelinkRegistry` 触发子串可对齐（任务标题侧需自行带关键词，见 relink 文档）。
- **Reveal 行为变更（有意）**：`seven_anchor_loop`、`school_leak_apartment_shell` 最低可见档从 fracture **抬到 deep**；fracture 新增「非普通徘徊者耦合」切片，避免开局七锚点名。

---

## 4. Reveal 样例（期望行为）

| `maxRevealRank` | `school_cycle_arc` | `school_source` | `major_npc_arc`（邻近欣蓝） |
|-----------------|--------------------|-----------------|-----------------------------|
| surface (0) | 仅传言级切片 | `injected: false` | 仅 `surfaceIdentity` |
| fracture (1) | 含「非普通徘徊者耦合」等，**不含**七锚/泄露长条 | `injected: true`，浅行 | `dutyEchoHint` + `relinkSignals`（若重连 ≥2） |
| deep (2+) | 含七锚、泄露、校源徘徊者、龙月、十日等 | 含深叙事截断行 | `schoolResidueHint`、`residualEchoHint` 等 |

自动化：`src/lib/registry/worldSchoolCycleAcceptance.test.ts`。

---

## 5. 六位高魅力 NPC：样例对话意图（人工验收用）

| ID | 表层意图（应优先成立） | 深层意图（仅 deep+ / packet 允许时） |
|----|------------------------|--------------------------------------|
| N-010 欣蓝 | 登记、路线、转职前置；克制、可先验式熟悉 | 名单焦虑、拒代选、牵引感；不替玩家剧透根因 |
| N-015 麟泽 | B1 边界、锚点、秩序 | 复活节拍残响、守界共担 |
| N-020 灵伤 | 补给、生活引导 | 声纹/创伤链、ribbon 信任 |
| N-018 北夏 | 交易、委托、对价 | 欠条体感、交换路由 |
| N-013 枫 | 7F 转运、话术诱导壳 | 替身梗耻感、非剥削验证 |
| N-007 叶 | 画室庇护、冷淡拒斥 | 镜像草案、轮廓残响 |

验收时检查：surface 回合对话**不出现**「七辅锚」「耶里学籍已定」等定论式输出，除非 packet 已给到该档。

---

## 6. 玩家首次进入时的体验预期

- 初见高魅力 NPC：**职业身份与场景职能**清晰，**不**默认旧友、**不**全员跟队。
- 邻校耶里：多为**传言**，非百科讲解。
- 欣蓝可略「像见过你」的压迫或安心感，但**不**交代循环/七锚全貌。
- 运行时 JSON 中 `reveal_tier_packet.maxRevealRank` 与各子包一致；模型应服从 stable 中的 **antiDump / 分步交付** 与 packet 的 `antiDumpPolicy`（若有）。

---

## 7. 欣蓝牵引 → 其他五人逐步重连（验证路径）

1. **欣蓝**：图鉴/任务推高好感或完成登记类任务 → `major_npc_relink_packet` 中欣蓝 `ph` 抬升；`xinlanPivotOpen` 为真（好感≥25 或 fracture 揭露档或世界标记）。
2. **其余五人**：在 **无危机** 时，个人 `ph=3` 通常需 **欣蓝牵引**（或 deep 揭露档等）；单有高好感可被卡在 `ph=2`（见 `majorNpcRelinkRegistry`）。
3. **危机窗口**：死亡/主威胁 breached 等可使 `crisisJoinWindowActive`，在满足个人门槛时 **临时** 允许到 `ph=3`，`phase3Traction` 可能为 `crisis_pressure`。
4. **叙事**：`team_relink_packet` 提供邻近 NPC 的 `textureLine`；**不等于** UI 队友状态。

自动化：`majorNpcRelinkRegistry.test.ts` + 本文第 4 节 packet 测试。

---

## 8. 风险点与后续建议

| 风险 | 缓解 | 后续 |
|------|------|------|
| 任务标题不含 relink 触发子串 | 任务注册时嵌入可匹配片段或世界标记 | 任务进度结构化 id 写入 playerContext |
| 快车道跳过 runtimePackets | stable 第 4 条禁止臆造深层 | 可选「微包」仅含 reveal_tier + 一行 policy（权衡 TTFT） |
| RAG 仍可能检索到 deep chunk | 检索层按 `reveal_*` tag 与当前档过滤 | 强化 query planner 与 fact 门闸 |
| 全仓库 `tsc` 未净 | 与本主题无关的历史错误 | 分期还债；CI 可先跑 targeted tests |

---

## 9. 如何跑验收测试

```bash
pnpm exec tsx --test src/lib/registry/worldSchoolCycleAcceptance.test.ts
pnpm exec tsx --test src/lib/registry/majorNpcRelinkRegistry.test.ts
pnpm exec tsx --test src/lib/playRealtime/runtimeContextPackets.test.ts
pnpm exec tsx --test src/lib/playRealtime/playerChatSystemPrompt.test.ts
```

建议合并进 CI 的 `test:unit` 范围（若当前 glob 已包含 `**/*.test.ts` 则已覆盖）。
