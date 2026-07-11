# Phase 4：NPC 声音卡与对白引擎 —— 让人物有声音、有温度

> **目标**：45 个 NPC 从"有设定"到"有声音"。六辅锚每人一张完整声音卡，群像补声，指定幽默功能位，对白配额进节奏指令。人物是广受众留存的核心资产——玩家为人留下来，不为走廊留下来。
> **前置**：phase-0/1/2 完成（phase-3 不强依赖，但建议按序）。**预计**：1–2 个会话。

---

## 0. 开始前必读

- STYLE_BIBLE §6（对白规范）、§8（voice card 模板与人设锚点）、§10 对照四/七
- `src/lib/registry/npcs.ts`（45 个 NPC 的 personality/taboo/lore/appearance）
- `src/lib/registry/world.ts` 的 `NPC_SOCIAL_GRAPH`（fixed_lore / speech_patterns / emotional_traits）
- `src/lib/registry/majorNpcDeepCanon.ts`（六辅锚深档）+ `src/lib/registry/npcProfiles.ts`
- `src/lib/playRealtime/multiNpcPersonaPackets.ts`（persona 卡注入：maxCards 4，maxChars minimal 900 / full 1400——**体积预算是本阶段的硬约束**）
- `src/lib/playRealtime/sceneActorGate.ts`（谁在场、谁能说话——只读理解，不改）
- `src/lib/npcConsistency/validator.ts` 与 `src/lib/narrativeEngine/checker.ts`（一致性护栏，只读理解）
- `src/lib/epistemic/` 与 `src/lib/turnEngine/epistemic/`（认知边界，只读理解）
- `scripts/eval-npc-consistency.ts` + `benchmarks/chat-turns/npc_consistency_gate.json`
- phase-2 的 `narrativeDirectivePackets.ts`（4.5 要扩展它）

---

## 1. 目标与非目标

**目标**：① 六辅锚声音卡；② 群像补声；③ 幽默功能位；④ persona packet 预算内呈现；⑤ 对白配额进节奏指令；⑥ 对白 golden 语料。

**非目标**：不改 NPC 的 canon 事实（身份、关系、taboo 的语义、战力、位置）；不改 sceneActorGate / npcConsistency / epistemic 的判定逻辑；不新增 NPC；不动 `NPC_EMOTION_POLISH` 等任务策略值。

---

## 2. 执行步骤

### 4.1 通读 NPC 数据链（不改代码）

核对进 PROGRESS：六辅锚深档现有字段与体积；`speech_patterns` 的数据形状与消费方；persona packet 的组装逻辑与两档预算的真实值；voice 类信息当前进不进 prompt、进多少。确认任务链里的"电工老刘"的 NPC id 与 registry 数据（若他只存在于任务文案而无 registry 条目，记 Deviations，幽默功能位改选其他 B1 常驻 NPC）。

### 4.2 六辅锚声音卡 + 群像补声

1. 按 STYLE_BIBLE §8 模板，为六辅锚（麟泽、灵伤、欣蓝、北夏、枫、叶）各写一张声音卡，写入 `majorNpcDeepCanon.ts`（深档）与 `NPC_SOCIAL_GRAPH.speech_patterns`（速查）——两处内容分工按现有字段职责，不重复堆料：
   - 说话习惯：句式长短、口头禅、语气词、沉默习惯（每人 2–3 条，具体到可模仿）。
   - 幽默/反差位：一句话定义该人物的"意外一面"。
   - 情感底线：什么事绝不开玩笑（与既有 taboo 对齐，不改语义）。
   - 典型一句：原创示例台词 1–2 句（few-shot 用，必须过 §6 对白规范自检）。
   - **人设锚点必须回收**（§8 列出的六条：留半行/估价/句尾空拍/眼尾冷/辨认轮廓/寡言可靠），在此基础上丰富，不许推翻。
2. 群像补声：从 N-001…N-045 中选至少 12 个高出场率环境 NPC（1F/3F/7F 常驻优先：陈婆婆、林医生、邮差老王、阿花、阿织阿绣、夜读老人、陶师傅、红姨、前调查员、廖暗、苏弥等），各补 1–2 条说话习惯，写入对应字段。
3. 写作纪律：每张卡先自查——这个人开口三句，读者能不能不看名字认出是谁？不能就重写。

### 4.3 幽默功能位

依据 4.1 核实的数据指定 2–3 个 levity 主承担者（候选优先级：北夏 > 枫 > 老刘/其他 B1 常驻），在其声音卡中显式标注"幽默功能位：夹带信息式玩笑"（§10 对照四的形态）。同时明确反例：麟泽、叶不承担玩笑（人设不符），灵伤的幽默只能是"太亮的笑"式无意识反差。

### 4.4 persona packet 预算内呈现

1. 检查 `multiNpcPersonaPackets.ts`：把声音卡要素纳入 persona 卡（口头禅/句式各 1 条 + 幽默位标记），**minimal 档（900 字符）只进最小要素，full 档（1400 字符）才带典型一句**。
2. 用 `eval:npc-consistency:mock` 的 `maxSceneActorPacketChars <= 1200` 与 packet 自身预算断言验证不超编；超了就砍呈现，不许扩预算。
3. 单测更新（persona packet 相关既有测试）。

### 4.5 对白配额进节奏指令

1. 扩展 phase-2 的 `buildNarrativeDirectiveBlock` 输入：`talkableNpcCount`（route 侧从 sceneActorGate 结果传入，只传数量与焦点 NPC 名，不传知识）。
2. 指令规则：在场可对话 NPC ≥1 且最近 2 回合 dialogueRatio 遥测低于 0.2 → 提示"本回合让在场人物开口，对白后落地到动作"；无人在场 → 不提对白。
3. 单测覆盖新分支。

### 4.6 对白 golden 语料 + 一致性回归

1. 用新声音卡写 4–6 段对白场景 golden 文本（不同 NPC、不同档位），加入 `benchmarks/narrative-style/cases.json`（`sceneContext.talkableNpcPresent: true`）。
2. `benchmarks/chat-turns/npc_consistency_gate.json` 增加用例：验证 persona 卡含声音要素且预算内、离场 NPC 仍不得发言（既有规则不回归）。
3. `pnpm eval:npc-consistency:mock` 全绿。

### 4.7 评测全套

`pnpm test:unit` → `eval:narrative-style:mock` → `eval:npc-consistency:mock` → 起 mock 服务跑 `eval:chat-quality:mock`、`eval:narrative-safety:mock`、`benchmark:chat:mock`。dialogueRatio 遥测与 phase-1 基线对比应上升。结果写 `baselines/<日期>-phase-4.md`。

---

## 3. 硬性禁止

- 不改 NPC canon 事实：身份、关系图结构、taboo 语义、战力、位置、揭示分层。声音卡是"怎么说话"，不是"知道什么"——**不得通过口头禅/典型一句泄漏该 NPC 不该知道的信息**（写完用 epistemic 视角自查每一句）。
- 不改 sceneActorGate / npcConsistency / checker / epistemic 的任何判定逻辑。
- 不扩 persona packet 的字符预算。
- 不新增 NPC、不给 NPC 改名。

---

## 4. 验收清单

- ✅ `pnpm test:unit`、`npx eslint .`
- ✅ `pnpm eval:npc-consistency:mock`（含新用例）全绿、packet 预算达标
- ✅ `pnpm eval:narrative-style:mock` gatePass（含对白 golden）
- ✅ `eval:chat-quality:mock` / `eval:narrative-safety:mock` / `benchmark:chat:mock` 全绿
- ✅ `baselines/` phase-4 文件 + PROGRESS 更新，NEXT 指向 phase-5

## 5. 汇报

按 CLAUDE.md §15。额外必须包含：六张声音卡摘要（每人一行）、幽默功能位名单、packet 体积前后对比、dialogueRatio 遥测变化。
