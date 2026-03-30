# 世界观闭环 · 玩家入口 · NPC 认知 · 任务与 UI · 回合稳定性 — 总审计与方案定稿 v3

**文档性质**：基于真实代码的审计结论 + 可实施架构定稿（阶段 1）。  
**约束**：不破坏现有 UI 框架、主游玩链路、DM JSON 契约、SSE 形状；仅允许贴合现有分层的小步重构。  
**关联代码与既有文档**：`world.ts`、`npcs.ts`、`npcProfiles.ts`、`majorNpcDeepCanon.ts`、`majorNpcRevealLadder.ts`、`npcHeart/*`、`playerChatSystemPrompt.ts`、`runtimeContextPackets.ts`、`taskV2.ts`、`taskRoleModel.ts`、`taskIssuerStyles.ts`、`taskBoardUi.ts`、`PlayNarrativeTaskBoard.tsx`、`PlayTaskPanel.tsx`、`codexDisplay.ts`、`openingCopy.ts`、`openingOptionPools.ts`、`play/page.tsx`、`api/chat/route.ts`、`dmParse.ts`；以及 `docs/major-npc-school-wanderer-design.md`、`docs/npc-epistemic-architecture.md`、`docs/npc-personality-task-time-architecture-v2.md`、`docs/npc-consistency-architecture-v2.md`。

---

## 1. 世界观闭环总纲：空间权柄碎片如何统一学校与公寓

### 1.1 产品总纲（本版必须统一的叙事底层）

- **单一本体**：校侧异常与公寓异常并非两条独立「世界来源」，而是同一 **【空间】权柄** 崩解后，在不同泡层上的投影与渗漏。
- **双泡层表象**：玩家在叙事中先后感知的「学校日常」与「如月公寓」是 **同一碎片系统** 的不同界面；学校是其中一层可被认知包裹的日常泡，公寓是另一层更裸露、消化性更强的泡。
- **月初节律**：每当月初，空间边界薄弱，**会有学生被渗漏卷入公寓**；这在楼内住户语境中是 **反复发生的常识**，不是主角独享的奇迹。
- **主角位置**：主角只是当月误入者之一；差异在于 **情绪控制与求生冷静度** 高于平均线，而非血统或天命唯一性。

### 1.2 与当前代码的差分（审计）

| 现状 | 代码位置 | 与总纲的关系 |
|------|-----------|----------------|
| 注册表大量以「公寓职能 / 耶里校源 / 辅锚 / 主锚 / 复活链」为工程语义组织真源，叙事上仍易被理解成「学校一条线、公寓一条线」 | `majorNpcDeepCanon.ts`（如 `schoolIdentity`、`wandererSubtype`、`residualEchoToProtagonist`）、`npcProfiles.ts`（`schoolCycleTag`、`deepSecret`） | **工程标签保留**，但须在 **玩家可见层** 用「空间渗漏 / 泡层 / 月初误入」统一解释，避免双源论 |
| 世界地图与楼层叙事仍以公寓消化、B1 安全区、7F 账簿等为主轴，未显式写入「空间权柄碎片」一句话世界观 | `world.ts`（`FLOORS`、`NPC_SOCIAL_GRAPH`、`buildLoreContextForDM`） | 需在 **DM 注入块与 floor lore** 增加 **短锚点句**（不增 JSON 契约），与校侧泡层对齐 |
| 北夏条目已存在「与【空间】碎片流通链直接关联」 | `npcProfiles.ts` `N-018` `deepSecret.dragonWorldLink` | **可复用为总纲支点**，但须避免开局把专名与机制说满 |
| `buildLoreContextForDM` 向 DM 输出全量 `【N-xxx】` + `fixed_lore` | `world.ts` `buildLoreContextForDM`（约 L518–549） | **DM 侧全知源**；须与 stable 规则、epistemic 块配合，防止台词层照搬内部 id 与设定长文 |

**定稿**：世界观统一句进入 **registry 常量 + `floorLoreRegistry` / `worldview_packet` 构建处 + stable 一条短规则** 三路冗余；**不**在玩家 UI 直接展示工程 id 或「辅锚」等词。

---

## 2. 玩家入口重塑：主角身份、月初误入、普通 NPC 共同认知

### 2.1 目标态

- 主角：**本月误入公寓的学生之一**；冷静、压恐惧，可写进固定开场与 stable 规则（与现有 stable 第 77 行方向一致，见下）。
- 楼内普通人：**见过不止一次「学生样的人月初出现又消失」**；态度在冷漠、惋惜、戒备、利用之间，而非「天命主角欢迎仪式」。

### 2.2 现状与代码锚点

| 片段 | 文件与位置 | 问题 |
|------|-------------|------|
| 固定开场大段为教室灾变、言灵、悬空身影，再坠入 B1 | `openingCopy.ts` `FIXED_OPENING_NARRATIVE`（L1–112） | 与「同一空间权柄、月初误入」可兼容（校泡破裂 → 落入公寓泡），但 **未写出月初节律、群体性误入、他人亦曾至此** |
| 首回合 DM 约束：禁止复述教室/言灵等 | `playerChatSystemPrompt.ts` `FIRST_ACTION_CONSTRAINT`（约 L173–174） | 与前端固定开场 **配套正确** |
| 开局系统 prompt 要求 `player_location: "B1_SafeZone"` 等 | `openingCopy.ts` `OPENING_SYSTEM_PROMPT`（L118–119） | 契约稳定；若重塑入口，仅改 **叙事正文与选项池语义**，保持字段名不变 |
| Stable 已写「普通 NPC：玩家默认误闯公寓的学生之一」 | `playerChatSystemPrompt.ts`（约 L77） | **已对齐目标**；缺口在 **固定开场与 NPC registry 台词素材** 未全员强化「月初、常见、非唯一」 |
| 选项池含「默念公寓规则稳住神志」 | `openingOptionPools.ts`（约 L36） | 偏 **机制/meta**，易打断沉浸；宜改为 **体内感受、脚步、声音** 类选项（不改 UI 样式，只改文案池） |

**定稿**：  
- **openingCopy**：在 **不拉长到教程感** 的前提下，增加 **2–4 句** 点明「月初、痕迹、前人」与「我只是又一个」；校侧灾变保留为 **泡层破裂镜头**，但避免单独成章像「另一部作品楔子」。  
- **world.ts / NPC_SOCIAL_GRAPH**：给 **高频开口普通人**（如陈婆婆、洗衣房阿姨、老刘）的 `speech_patterns` / `new_tenant_guidance_script` 增加 **可观测的「又见学生」** 口径，禁止「等你很久了旧识」式默认。  
- **codex**：见 §5，`buildCodexIntro` 目前拼接 `npc.lore`，若 lore 含剧透或内部词，会直达玩家。

---

## 3. 高魅力 NPC / 夜读老人 / 欣蓝：差异化初始认知

### 3.1 权限与代码真源

| 角色类 | Stable 规则 | 结构化真源 |
|--------|-------------|------------|
| 普通 NPC | 不得默认旧识；误闯学生 | `playerChatSystemPrompt.ts` ~L77 |
| 高魅力六人 + 夜读老人 | 可在 packet 许可下 **异常熟悉感** | 同文件 ~L78–79 |
| 欣蓝 | 强牵引但 **禁全知一口说尽** | `xinlan-anchor` 同文件 ~L79–82、129–130 |
| 分层揭露 | surface/fracture 禁答案型校名 | `majorNpcRevealLadder.ts`、`buildMajorNpcKeyHintsForPacket`（`majorNpcDeepCanon.ts` 末段） |

### 3.2 审计问题（具体位置）

1. **NpcHeart prompt 向模型输出 `N-015（麟泽）` 形态**  
   - `npcHeart/prompt.ts` `buildNpcHeartPromptBlock`（约 L27–29）：`★${p.npcId}（${p.displayName}）` — **DM 侧可接受**，但须约束 **narrative 不得复述 id**（stable 已有原则）；若泄漏到玩家可见日志需 sanitize（见 §5）。

2. **夜读老人注册表 lore 直给「消化日志」**  
   - `npcs.ts` `N-011` `lore`（约 L160）：玩家解锁图鉴后，`codexDisplay.buildCodexIntro` 会以 `传闻：` 前缀展示（`codexDisplay.ts` L70–71）— **开局剧透风险**，与「不能开场剧透」冲突。

3. **欣蓝 deepCanon 合理但需防叠加**  
   - `majorNpcDeepCanon.ts` `N-010` `surfaceFixedLoreParagraph` 等：信息量大，依赖 `reveal_tier` + foreshadow 阶梯；若 RAG/检索同时喂入带校源的第二句 `lore`（见 `docs/npc-personality-task-time-architecture-v2.md` §1.4），**仍可能抢跑**。

4. **高魅力六人 `residualEchoToProtagonist` 多写「主锚/复活」**  
   - `majorNpcDeepCanon.ts` 各条目：工程正确，但 **台词层** 必须只落 **既视感、停顿、拒并队理由**（`majorNpcRevealLadder.ts` `fractureBoundaryNote` 已写明禁直述）。

**定稿**：  
- **夜读老人**：玩家可见 `lore`/图鉴简介改为 **公寓职能壳 + 违和感**；「消化日志」仅保留在 **deep packet / DM-only lore**。  
- **欣蓝**：维持第一牵引，但 **任何玩家可见摘要** 禁止出现「七辅锚、闭环、主锚」等词；仅允许表格、名单焦虑、拒代选。  
- **六人**：`npc_epistemic_residue_packet` / foreshadow **只给动作与矛盾**，与现有 `selectMajorNpcForeshadowRows` 一致。

---

## 4. 开场体验重构：前端固定开场、选项、首轮引导、接触顺序

### 4.1 当前链路

1. 客户端渲染 `FIXED_OPENING_NARRATIVE` + `pickEmbeddedOpeningOptions()`  
2. 首条请求带 `OPENING_SYSTEM_PROMPT`，模型产出 **占位 narrative「。」** + 空 `options`（客户端忽略 options）  
3. `play/page.tsx` 内与 `openingStreamUi`、`tryParseDM` 协同完成首回合结算  

### 4.2 定稿调整（不改 SSE/JSON 形状）

| 项 | 动作 |
|----|------|
| 固定开场 | 重写 `openingCopy.ts` 正文：空间权柄统一观 + 月初误入 + 冷静主角 + 前人痕迹（保持第一人称、原创节奏，禁止仿名著名句） |
| 四选项 | `openingOptionPools.ts`：去掉「公寓规则」类 meta 句；保留探索/观察/社交/谨慎四倾向 |
| 首轮引导 | Stable 已与 `FIRST_ACTION_CONSTRAINT` 对齐；可在 `controlAugmentation` 或 B1 包中 **增加一句「本层安全但非出口」**（走现有 packet 构建，不加新 SSE 字段） |
| 接触顺序 | 产品建议：**灵伤/洗衣（后勤噪声）→ 麟泽（边界）→ 配电老刘（工具/记账引导）→ 1F 欣蓝**，与 `majorNpcDeepCanon` `naturalContactChain` 多条一致；**不强制脚本**，通过 **NPC 初始位置 + 任务门闸** 软引导 |

---

## 5. 前端显示清洗：内部 id、开发者语气、任务板术语、图鉴口吻

### 5.1 具体问题位置

| 问题 | 位置 |
|------|------|
| 任务关联人物缺 codex 时 **直接显示 `N-xxx`** | `PlayNarrativeTaskBoard.tsx` `npcLine`（约 L37–44）：`return id` 分支 |
| 物品未注册时显示 **raw item id** | 同文件 `itemLabelsForTask` / `requiredItemLabels`（约 L24–34） |
| 面板副标题「头等事 · 可推进路径 · 承诺与风险」 | `PlayTaskPanel.tsx`（约 L35）— 产品可接受；若要去「系统感」可改为 **剧情化副标**（属文案，非视觉样式） |
| 图鉴简介拼接 `npc.lore`， major 人物 lore 可能含「详情见 majorNpcDeepCanon」式 **开发者指向** | `npcs.ts` 叶/欣蓝等（如 L105、L146）；`codexDisplay.ts` `buildCodexIntro` |
| 运行时包内职业 hints 含英文系统字段名 | `runtimeContextPackets.ts` `buildProfessionSystemHints`（约 L398–424）：如 `main_threat_updates` — **模型易学舌进 narrative** |

### 5.2 定稿

- **任务板 / 图鉴**：凡展示层 **禁止裸 id**；fallback 走 `lookupNpcNameById` / `findRegisteredItemById` 已有工具（`codexDisplay.ts`、`itemLookup`）。  
- **registry 文案**：`NPCS[].lore` 与 `buildCodexIntro` 共用一条 **玩家安全层**（仅表象 + 传闻 + 忌讳），与 DM-only 分层。  
- **runtimePackets**：`profession_system_hints_packet` 改为 **全中文、无字段名** 的短 hint，或标记为「仅 DM 编排勿照读」——优先 **改文案** 以符合 stable「禁止机制讲解」精神。

---

## 6. 任务系统重构：soft lead / conversation promise / formal task 的产品分工

### 6.1 类型真源

- `taskRoleModel.ts`：`TaskNarrativeLayerKind`、`inferEffectiveNarrativeLayer`、`pathDemotionBias`  
- `taskV2.ts`：`GameTaskV2` 可选字段 `taskNarrativeLayer`、`shouldStayAsSoftLead`、`shouldStayAsConversationPromise`、`shouldBeFormalTask`、`goalKind`、`promiseBinding`  
- `taskIssuerStyles.ts`：`applyIssuerDriveDefaults` 将六人模板写入任务  
- `objectiveAdapters.ts`：`inferObjectiveKind` — **soft_lead 被映射为 `commission`**（L16–17），与产品语义 **不完全同构**

### 6.2 产品分工（定稿）

| 层 | 玩家感知 | 存档 / UI | 生成条件 |
|----|-----------|-----------|----------|
| **soft_lead** | 手记、对话里的「方向感」 | **默认不进任务板** 或进 **手记区**（若暂无独立 UI，则用 `status:hidden` + clue 关联，避免板面污染） | DM `dm_change_set` → clue，或 `new_tasks` 带 `shouldStayAsSoftLead:true` 且服务端归一为 hidden |
| **conversation_promise** | 「我答应过谁」 | 可显示为 **承诺** 带（现有 `goalKindLabel` 已有「承诺」） | `promiseBinding` + 叙事明确答应；stable 已述阶段 6 规则（`playerChatSystemPrompt.ts` ~L111） |
| **formal_task** | 委托、追踪、奖励 | `active/available`、任务板分区 | NPC 正式托付 + `narrative` 可见 + 服务端 `normalizeDmTaskPayload` 通过 |

### 6.3 与 `taskBoardUi` 的关系

- `partitionTasksForBoard`（`taskBoardUi.ts`）当前 **仅排除 `hidden`**，**不按 narrative layer 过滤**（L94–98）。  
- `pickPrimaryTask` **主线绝对优先**（L37–39），易把人物线压扁（`taskRoleModel.ts` 头部审计已述）。

**定稿**：在 **不改 `GameTaskV2` 字段含义** 的前提下：  
1. 服务端对 DM 下发任务统一跑 `applyIssuerDriveDefaults` + **显式 layer 决策**；  
2. UI 侧对 `soft_lead` **默认不进入** `partitionTasksForBoard` 的 `open` 集合（或要求 `status===hidden` 直至升格）；  
3. 修正 `inferObjectiveKind` 对 soft_lead 的展示类名（避免与「委托」混淆）——可用 **独立展示标签**「动向」等，**不改 JSON id**。

---

## 7. 「未在叙事中正式授予的任务不展示」：可行性与改法

### 7.1 可行性：**高**

- Stable 已要求叙事与 `new_tasks` 等同拍（`playerChatSystemPrompt.ts` ~L113–114）。  
- 客户端结算路径在 `play/page.tsx` 合并 `parsed.new_tasks` 等；服务端 `route.ts` 亦有 `normalizeDmTaskPayload`、`applyNpcProactiveGrantGuard` 等守卫。

### 7.2 推荐改法（小步）

1. **服务端**：对每条 `new_tasks` 打 **`surfaced_in_narrative` 或等价内部标志**（若已有 `narrativeTrace` 则复用）；**未置真则丢弃或强制 `hidden`**。  
2. **模板任务 / 引导任务**：仅允许从 **白名单 id**（如老刘引导、B1 服务）在 **首局** 自动 `active`，且标题/描述用 **叙事句** 非系统句。  
3. **`npcProactiveGrant`**：与叙事块联动（`taskV2.ts` 已有冷却与地点 gate）：发放时 **要求本回合 narrative 出现「托付」语义**（可用轻量关键词或 change_set 链接，避免上大模型判卷）。

---

## 8. 老刘、麟泽的新手引导重构

### 8.1 现状

- 老刘：`world.ts` `N-008` `new_tenant_guidance_script`（约 L297–298）— **内容偏记账生存**，与总纲兼容；可增强 **「每月都有学生掉下来」** 一句群众常识。  
- 麟泽：`majorNpcDeepCanon.ts` `N-015` `naturalContactChain`（约 L129–133）— **边界优先**；任务钩 `anchor.oath.b1`、`border.watch.log`（`implementationNotes`）。

### 8.2 定稿

- **老刘**：电工壳 + **黑猫/线路** 保留；引导词增加 **月初误入常识**（非剧透主锚），强调 **不要把他写成「系统教程 NPC」** — 用骂骂咧咧带信息。  
- **麟泽**：**禁止首见即交代校名或辅锚**；仅 **挡位、注视、越界纠正**；正式教导入任务须 **`trust`/任务门闸**。

---

## 9. NPC 关系可感知化：叙事 + 面板

### 9.1 现状

- 关系数值进 codex、`computeRelationshipLabel`（`codexDisplay.ts`）输出 **盟友/恋人/敌人/暂无** — **粗粒度**。  
- 社交图 rich text 在 `world.ts` `NPC_SOCIAL_GRAPH` / `majorNpcDeepCanon` `relationships`，**主要喂 DM**，玩家面板 **缺少「对谁冷淡、怕谁、欠谁」短标签**。

### 9.2 定稿（不改 JSON 契约方向）

- **叙事层**：`key_npc_lore_packet` / `team_relink_packet` 已有 hints；增加 **1 条「关系张力」短句** 仅当相关 NPC **同场或 world flag 解锁**（走现有 packet 大小写）。  
- **面板层**：图鉴详情在 `buildCodexIntro` 之外，增加 **可选「楼内传闻」一句**（从 `NPC_SOCIAL_GRAPH.relationships` 派生 **匿名化** 描述，不出现内部 id）；**不新增复杂 UI**，仅文本。

---

## 10. 回合提交稳定性：为何「剧情数据格式异常」会吞掉整回合日志与结算

### 10.1 因果链（代码级）

1. 流结束进入 `turn_committing`：`play/page.tsx`（约 L1387–1399）  
2. `tryParseDM(raw)`（`dmParse.ts` `tryParseDM`，L253+）：  
   - 扫描多个 `{...}` 候选，`parseSliceToDm` 需满足 `isValidDmShape`（L56–64）：**必须含** `is_action_legal`（boolean）、`sanity_damage`（number）、`narrative`（string）、`is_death`（boolean）  
   - `jsonrepair` 失败或 shape 不对 → **返回 null**  
   - `sanitizeNarrativeLeakageForFinal` / `hasProtocolLeakSignature` 命中 → **返回 null**（保守拒绝，L277–283）  
3. **`parsed === null`** 时：设置 `liveNarrative` 为 **「本回合剧情数据格式异常，未写入日志与结算…」**（`page.tsx` L1392–1398），并 **return**，**不执行后续 push log、不改 store**。

### 10.2 定稿（优化方向，不改变契约）

- **观测**：保留 `console.error`（`dmParse.ts` `logTryParseFailure`）；可增加 **遥测计数**（非 UI）。  
- **缓解**：上游 `route.ts` `normalizePlayerDmJson` / 审核管道尽量 **修类型**（boolean/number 强制）— **仅限服务端已存在管道内**，客户端仍以 tryParseDM 为最后闸门。  
- **产品文案**：可向玩家区分 **「流被截断」** 与 **「JSON 不合格」**（仍用同一条 SSE，仅错误提示细分），减少挫败感。

---

## 11. 分阶段实施计划

| 阶段 | 内容 | 主要触碰文件 |
|------|------|----------------|
| **P0** | 固定开场 + 选项池 + 夜读/图鉴玩家层 lore 去剧透 + 任务板 id fallback | `openingCopy.ts`、`openingOptionPools.ts`、`npcs.ts` 或分层 lore 源、`PlayNarrativeTaskBoard.tsx`、`runtimeContextPackets.ts` hints 中文 |
| **P1** | 世界观一句进 floor/worldview stable；普通人台词脚本月初误入；`buildLoreContextForDM` 与 player 展示 decouple 复查 | `world.ts`、`floorLoreRegistry`（若存在）、`playerChatSystemPrompt.ts` |
| **P2** | soft_lead 默认 hidden / 不进板；服务端 narrative 门闸；`inferObjectiveKind` 展示标签 | `taskV2.ts`、`route.ts`、`taskBoardUi.ts`、`objectiveAdapters.ts`、`play/page.tsx` |
| **P3** | 关系可感知短句进 packet/codex；老刘/麟泽引导句迭代 | `worldLorePacketBuilders.ts` 或 codex 构建、`world.ts` / `majorNpcDeepCanon.ts` 审核 |
| **P4** | tryParseDM 失败细分提示 + 可选服务端类型修补 | `page.tsx`、`normalizePlayerDmJson` |

---

## 12. 每阶段验收标准

- **P0**：新档首屏文案无内部 id/开发者指向；图鉴夜读条目不提「消化日志」全称；任务板无裸 `N-xxx`/道具 id。  
- **P1**：随机抽 20 回合 DM 输出，普通 NPC **无默认旧识、无系统腔**；稳定出现「月初误入」常识至少一种 NPC 入口。  
- **P2**：soft lead **不在任务板主列表**；正式任务均在叙事中有 **可复述的托付瞬间**（人工 spot check + 日志）。  
- **P3**：玩家能说出「A 怕 B / 与 C 交易」类关系 **无需读 registry**。  
- **P4**：格式错误率下降或错误提示可区分截断/解析（ telemetry 对比）。

---

## 13. 风险与回滚策略

| 风险 | 缓解 | 回滚 |
|------|------|------|
| 开场改写引发老玩家违和 | 仅影响新会话；可 feature flag 文案版本 | Git revert 文案文件 |
| 任务 hidden 逻辑过严导致「接不到任务」 | 白名单引导任务 + telemetry | 放宽守卫条件 |
| packet 加长挤占 budget | 只增短句，走 compact 路径测长度 | 删增量键 |
| 图鉴信息与 DM lore 不一致 | 单源 `playerSafeLore` | 恢复 `npc.lore` 拼接 |

---

## 附录 A：本次审计摘录的关键代码引用（便于跳转）

- DM 首回合占位规则：`playerChatSystemPrompt.ts` `FIRST_ACTION_CONSTRAINT`  
- 误闯学生 stable：`playerChatSystemPrompt.ts` ~L77  
- 解析失败吞回合：`play/page.tsx` ~L1387–1399；`dmParse.ts` `tryParseDM`  
- 任务分层类型：`taskRoleModel.ts`、`taskV2.ts`  
- 任务板分区：`taskBoardUi.ts` `partitionTasksForBoard`  
- 运行时大包：`runtimeContextPackets.ts` `buildRuntimeContextPackets`  
- 高魅力真源：`majorNpcDeepCanon.ts`、`majorNpcRevealLadder.ts`  
- 固定开场：`openingCopy.ts`、`openingOptionPools.ts`

---

*文档结束。*
