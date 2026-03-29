# NPC 认知边界与记忆串台：专项审计与落地方案

> **范围**：VerseCraft 主游玩链路（客户端 `playerContext` → `/api/chat` → DM 模型），**不改动**既有 JSON 输出契约、不替换主循环架构。  
> **关联**：[`docs/stage1-dm-prompt-architecture.md`](./stage1-dm-prompt-architecture.md)、[`src/lib/playRealtime/playerChatSystemPrompt.ts`](../src/lib/playRealtime/playerChatSystemPrompt.ts)、[`src/lib/memoryCompress.ts`](../src/lib/memoryCompress.ts)、[`src/lib/npcHeart/types.ts`](../src/lib/npcHeart/types.ts)。

---

## A. 当前链路梳理（基于代码路径）

### A.1 DM Prompt 组装（主路径）

| 环节 | 文件 / 符号 | 作用 |
|------|-------------|------|
| Stable 规则 | `getStablePlayerDmSystemPrefix()` ← `buildStablePlayerDmSystemLines()` | 合规、JSON 契约、叙事边界、packet 名声明、欣蓝 `xinlan-anchor` 等 |
| 动态后缀 | `buildDynamicPlayerDmSystemSuffix()` | 拼接 `memoryBlock`、`当前玩家状态：${playerContext}`、首回合约束、`controlAugmentation` |
| 服务端组装 | `src/app/api/chat/route.ts` | `playerDmStablePrefix` + `dynamicCore`；后再与 `runtimePackets`、lore augmentation 合并 |
| Session 压缩记忆 | `buildMemoryBlock(sessionMemory, …)` ← `playerChatSystemPrompt.ts` | 有 DB 行时注入「剧情摘要 / 玩家状态快照 / **NPC 关系快照**」 |
| 客户端长文上下文 | `useGameStore.getState().getPromptContext()` | `src/store/useGameStore.ts`：档案、时间、位置、属性、职业、任务、图鉴摘要、**世界记忆提要**（memory spine）、导演层、**NPC 心脏块**、威胁、武器、手记咬合等 |

### A.2 动态记忆压缩（Session Memory）

| 环节 | 文件 | 行为 |
|------|------|------|
| 触发 | `route.ts`（回合数超阈值且登录用户） | 异步 `compressMemory(sessionMemory, toCompress)`，**不阻塞首字** |
| 压缩提示词 | `src/lib/memoryCompress.ts` `COMPRESSION_PROMPT` | 要求输出 **「全局状态报告」**：`plot_summary`（约 300 字）、`player_status`、`npc_relationships`（key 为 NPC 名或 ID） |
| 持久化 | `gameSessionMemory` 表 | `plotSummary` / `playerStatus` / `npcRelationships` 单行 per user |
| 注入 | `buildMemoryBlock` | 将上述三者**原样**截断后写入 system 动态段，**无「认知主体」标注** |

### A.3 NPC 关系与人格（NpcHeart）

| 环节 | 文件 | 行为 |
|------|------|------|
| 类型 | `src/lib/npcHeart/types.ts` | `NpcHeartProfile`（面具、驱动、恐惧、话术契约、真相带等）、`NpcHeartRuntimeView`（态度、当下诉求、`escapeRole` 等） |
| 选人 | `selectRelevantNpcHearts` ← `useGameStore.getPromptContext` | 同场景 `presentNpcIds`、任务 `issuerId`、memory spine `usedIds` 等，**最多 3 人** |
| 视图 | `buildNpcHeartRuntimeView` | 用 `codex[npcId]` 作 `relationPartial`（数值关系），**不是「该 NPC 已知事实列表」** |
| 写入 prompt | `buildNpcHeartPromptBlock` | 「NPC心脏约束」：**写作风格与禁区**，未声明「该 NPC 不知道什么」 |

### A.4 Memory Spine（世界记忆脊柱）

| 环节 | 文件 | 行为 |
|------|------|------|
| 条目类型 | `src/lib/memorySpine/types.ts` | `MemorySpineScope`: `run_private` / `npc_local` / `location_local` / `session_world` |
| 召回 | `selectMemoryRecallPacket` ← `selectors.ts` | 按位置、楼层、**presentNpcIds**、任务、worldFlags 等**打分**，**不按「当前说话者」过滤** |
| 拼块 | `buildMemoryRecallBlock` ← `prompt.ts` | 输出 **「世界记忆提要：」** + 多条 `summary` 字符串，**不区分谁能听见** |

### A.5 Runtime packets / retrieval / control augmentation

| 环节 | 文件 | 行为 |
|------|------|------|
| Runtime JSON | `buildRuntimeContextPackets` ← `runtimeContextPackets.ts` | 自 `playerContext` 解析位置、时间、标记等，拼 floor / threat / school cycle / major NPC 等子包 |
| Lore retrieval | `getRuntimeLore` ← `worldKnowledge/runtime/getRuntimeLore.ts` | `worldScope` 默认 `["core","shared"]`，经 `revealGate` 与 **maxRevealRank** 裁剪；**无「NPC 演员视角」scope** |
| Control | `buildControlAugmentationBlock` 等 | `route.ts` 内与 preflight 控制面、lore 摘要合并进 `controlAndLoreAugmentation` |

### A.6 主请求中「最终喂给模型」的信息（归纳）

对 **PLAYER_CHAT** 而言，模型在语义上同时拿到：

1. **全局叙事记忆**：`plot_summary` + 截断的 `player_status` / `npc_relationships`（session memory）。  
2. **玩家侧长快照**：`getPromptContext()` 全文（含任务、图鉴、NPC 位置、**全图式 NPC 关系/图鉴摘要**、memory spine 提要、NPC 心脏写作约束、武器、手记 id 等）。  
3. **世界知识包**：runtime packets +（慢车道）lore retrieval 事实，按 **揭露档位** 门控，**非按 NPC**。  
4. **短期对话**：`route.ts` 截断后的 `messagesToSend`，含历史 **assistant narrative**（其中可能含仅对玩家成立的秘密）。  
5. **本回合用户消息**：经包装后的「玩家输入原文」+ 暗骰说明。

**架构事实**：全程是 **单一 DM 模型**，由 stable 规则要求其区分对白与叙事；**没有**为每个 NPC 单独开「子会话」或「子上下文」。因此，任何进入 system/user 的 **全局** 文本，在工程上都等价于「叙述者全知池」，只能靠 **提示词自律** 与 **后续过滤** 约束，无法单靠模型「自动」隔离。

---

## B. 「NPC 认知越界」根因分析

### B.1 系统知道 ≠ NPC 知道（混淆点）

| 混淆点 | 表现 |
|--------|------|
| Session memory 文案 | `memoryCompress.ts` 明确要求 **全局** 剧情摘要与 **全局** NPC 关系表；`buildMemoryBlock` 标题为「动态记忆」，易被模型理解为 **所有角色共享的认知背景**。 |
| `npc_relationships` | 结构是「多个 NPC 对玩家的态度」**并列**展示，**未标注**「仅 DM 编排用，具体 NPC 台词不得引用其他 NPC 的私密线」。 |
| Memory spine 提要 | `世界记忆提要` 命名偏 **客观世界事实**，未标注 **玩家可见 / 仅 DM 知道 / 某 NPC 私有**。 |
| Codex / 图鉴 | `playerContext` 中含「图鉴已解锁」等摘要；模型易把「玩家图鉴条目」当成「在场 NPC 已听说」。 |

### B.2 全局 `plot_summary` 与每回合 DM

- **是**：只要 `gameSessionMemory` 有行且 `plot_summary` 非空，**每回合** `buildMemoryBlock` 都会注入（快车道仅缩短字符上限，**不关闭**摘要）。  
- **风险**：摘要由压缩模型从对话生成，**极可能**把「玩家独自发现、未告诉任何人」的情节写进摘要 → 下一回合所有 NPC 叙事「间接」获得。

### B.3 `player_status` / `npc_relationships` 是否被当成「全员知道」

- **工程上**：二者是 **DM system 片段**，不是某个 NPC 的私有 buffer。  
- **产品上**：未配套 stable 规则中的 **强分隔句**（例如：「摘要中的秘密除非 narrative 已公开，任何 NPC 不得作为已知事实引用」）的 **可执行校验**；仅靠现有「保密与揭露」原则性描述，**不足以**对抗强摘要。

### B.4 Retrieval / packets 与 actor scope

- **worldKnowledge**：`worldScope` 为 `core` / `shared` 等，**不是** `npc:N-xxx`。  
- **revealGate**：按 **玩家侧** `maxRevealRank` 与事实档位过滤，**不是**「当前对白 NPC 可见档位」。  
- **runtime packets**：major_npc / school_cycle 等是 **世界观供给**，默认服务 **叙述者**，不区分「谁在场」。

### B.5 玩家越界发言检测

- **现状**：`moderateInputOnServer`、合规路径存在；**无**专门针对「玩家对 NPC A 说出仅 NPC B 或仅玩家应知的秘密」的 **结构化检测**（无 `utterance_tags`、无 `leak_risk` 字段）。  
- **结果**：越界内容仍进入 `latestUserInput`，由模型自由生成反应 → **易顺着玩家错误前提演下去**。

### B.6 生成后知识泄露审查

- **现状**：流式输出后主要依赖 JSON 解析与安全拦截；**无**「本回合 narrative 是否让在场 NPC 引用了不在其认知集内的事实」的 **二次模型或规则扫描**（feature 缺口）。

### B.7 与「记忆串台」叠加的因素

- **对话历史**：assistant 过去回合写下的秘密，仍在 `messagesToSend` 窗口内 → **同一模型**续写时引用概率高。  
- **NpcHeart 仅 3 人**：其他 NPC **没有**对应的「禁区/不知」提示块，更易被全局摘要带跑。  
- **欣蓝特殊性**：`playerChatSystemPrompt` 中 `xinlan-anchor` + `selectors.ts` 中 `N-010` → `escapeRole: gatekeeper`；属于 **叙事特权** 的 **提示层** 约定，**不是**数据层的独立认知集合。

---

## C. 分层设计（贴合现状的小步重构）

> 目标：在 **不新增向量库**、**不改 JSON 键** 的前提下，用 **带标签的数据 + 组装时过滤 + 提示词加固** 逐步逼近「可阻断的」认知边界。

### C.1 世界真实层（World Ground Truth）

| 项 | 说明 |
|----|------|
| **用途** | 引擎与审计用的「实际发生的事」（含未公开真相）。 |
| **输入来源** | 结构化回合字段、`memorySpine`（高置信条目）、将来可扩展的「事实注册表」（轻量 JSON/表，非向量）。 |
| **是否进 prompt** | **仅**进入 **DM 编排私有段**（新块名建议：`【DM私有编排·勿写入NPC台词】`），且默认 **不落进 NPC 可执行子集**。 |
| **NPC 读取** | **默认不允许**；**欣蓝** 可通过 `xinlanKnowledgeBand`（见 C.6）放宽 **子集**。 |

### C.2 场景公共层（Scene Public）

| 项 | 说明 |
|----|------|
| **用途** | 同场景内「合理公共信息」：可见环境、公开告示、当场发生的对话（**已发生且在场**）。 |
| **输入来源** | runtime location packets、当场 `presentNpcIds`、本回合及近期 narrative 中 **显式发生在当前场景** 的摘要（可由 spine 条目标记 `scope: location_local` 优先）。 |
| **是否进 prompt** | **是**，作为默认 narrative 基础。 |
| **NPC 读取** | **在场 NPC** 默认可用；不在场 **不可用**（靠组装时剔除 + stable 规则一句）。 |

### C.3 玩家已知层（Player Knowledge）

| 项 | 说明 |
|----|------|
| **用途** | 图鉴、手记、玩家任务描述、玩家背包可见信息。 |
| **输入来源** | `journalClues`、结构化 `clientState`、`playerContext` 中已有摘要。 |
| **是否进 prompt** | **是**，但须 **标注**「玩家视角」；**禁止**模型将其等同为「NPC 已听说」，除非 C.2 已覆盖。 |
| **NPC 读取** | **默认不允许**；NPC 仅可在 narrative 中 **从玩家言行** 推断（见 C.5）。 |

### C.4 NPC 私有认知层（Per-NPC Private）

| 项 | 说明 |
|----|------|
| **用途** | 每个 NPC **明确知道的事实**（弱引用 id + 短句，上限条数）。 |
| **输入来源** | 由 `relationship_updates` / `codex_updates` / 未来 `dm_change_set` **可选扩展**（仅新增 **可选** 字段，不破坏现有必填）写入 **存档侧** 影子结构；首版可用 **现有 codex `known_info` 按 NPC 拆分** 的保守子集。 |
| **是否进 prompt** | **仅**当该 NPC ∈ `presentNpcIds` 且本回合 narrative 需要其发言时，注入 **该 NPC 一条** `【N-xxx 已知事实（短）】`。 |
| **NPC 读取** | **仅本人**；其他 NPC **不得**在台词中引用（stable + 后验抽查）。 |

### C.5 可推断层（Inferable）

| 项 | 说明 |
|----|------|
| **用途** | NPC **不允许**直接引用秘密，但可根据玩家 **越界暗示** 产生怀疑、试探、沉默、敌意。 |
| **输入来源** | 与玩家输入相关的关键词/结构化 flag（轻量规则或小型分类，**非**新向量库）。 |
| **是否进 prompt** | 以 **指令** 形式：`【若玩家提及不在本NPC认知集内的事实，优先反应：困惑/试探/拒绝讨论/转移话题】`。 |
| **NPC 读取** | 不是「事实」，是 **行为策略**；全体 NPC 可用，**欣蓝** 可有额外「牵引」策略（与现有 xinlan-anchor 对齐）。 |

### C.6 「情绪残响」（Emotional Residue）

| 项 | 说明 |
|----|------|
| **定义** | **不**存储具体事实句子；仅存 **情绪/关系标量或短标签**（如 `unease_toward_player: 0.7`、`distrust_topic: anchor`）。 |
| **用途** | 解释「NPC 似乎记得某种不适，但说不清」；降低串台却保留质感。 |
| **落地建议** | 优先挂在 **现有** `NpcRelationStateV2` / codex 数值侧或 `memorySpine` `kind: npc_attitude` + **极短 summary 禁止含专有名词**（或经规则剥离专名）。 |
| **进 prompt** | `【N-xxx 情绪残响：不安↑，原因不可明说】` 级别，**不与 plot_summary 混写**。 |

### C.7 欣蓝（N-010）例外策略

| 项 | 说明 |
|----|------|
| **保留** | stable 中 `xinlan-anchor`、`escapeRole: gatekeeper`、major_npc packet 的渐进揭露逻辑。 |
| **数据层** | 增加显式 `xinlanEpistemicTier` 或复用 `reveal_tier_packet` 的档位，**仅**影响 **N-010 私有块** 可挂载的「牵引信息」上限。 |
| **约束** | **其他 NPC 不继承**欣蓝的扩展集合；组装函数 **禁止** 把欣蓝私有块复制到全局摘要。 |

---

## D. 与现有组件的兼容关系（强制不破坏契约）

| 组件 | 兼容方式 |
|------|----------|
| **JSON 契约** | 不新增必填键；若引入 NPC 认知补丁，仅用 **可选** `dm_change_set` 子字段或 **存档内** 新表/新 JSON 列（向后默认空）。 |
| **`memoryCompress.ts`** | **第一阶段**不改输出 schema，增加 **第二路**「玩家可见摘要」写入 DB 新列或 JSON 内子键；旧客户端忽略。压缩提示词改为区分 **DM 全局编排** vs **可复述层**（分字段输出，仍是一个 JSON 对象）。 |
| **`buildMemoryBlock`** | 增加 **前缀标签** 与 **分段**（仍是一段 string），或拆成两个 section：**(A) DM-only** / **(B) 可进对白**。不改函数签名亦可先只做文案加固。 |
| **`playerChatSystemPrompt.ts`** | 仅 **追加** stable 行：认知分层、NPC 不得引用 DM-only、越界反应；**bump** `VERSECRAFT_DM_STABLE_PROMPT_VERSION`。 |
| **Memory spine** | 已有 `scope`：**召回后**按 `npc_local` 与 `presentNpcIds` 交集过滤；`session_world` 默认进 DM-only 段。 |
| **Retrieval** | 维持 DB + revealGate；**组装**时在 `buildLorePacket` 之后增加 `filterFactsByEpistemicMode(dm_only | player_visible)` 的 **薄层**（首版可把高风险 fact 标为 dm_only）。 |

---

## E. 分阶段实施计划与验收标准

### 阶段 0（文档与基线）

- **交付**：本文档定稿；telemetry 增加 `promptSectionBytes{memory,session,playerContext,lore}` 基线。  
- **验收**：能在日志中区分各段长度，无功能变更。

### 阶段 1（提示词与标签，零 schema 变更）

- **改**：`playerChatSystemPrompt.ts` 增加 **强认知分隔** 规则；`buildMemoryBlock` 增加 **DM-only 警示** 标题行。  
- **验收**：人工抽检 20 回合：玩家独知秘密不在场 NPC **不直呼**（定性）；无 JSON 字段变化。

### 阶段 2（Memory spine + session 分拆）

- **改**：`selectMemoryRecallPacket` 输出分 **dmRecall** / **sceneRecall**（或打标签后由 `getPromptContext` 分两段拼接）；`compressMemory` 提示词输出 `plot_summary_dm` vs `plot_summary_player_safe`（并存于 JSON，旧键保留别名）。  
- **验收**：单元测试：含 `secret_fragment` scope 的条目不得进入「scene」段；回归 `memoryCompress` 解析测试。

### 阶段 3（NPC 私有认知块）

- **改**：`getPromptContext` 对 `presentNpcIds` 各生成 **一行**「已知事实」（来源 codex/新 shadow）；**不在场不写**。  
- **验收**：集成测试：仅 NPC A 在场时，prompt 中不得出现「B 的私有块」。

### 阶段 4（越界输入与生成后审查）

- **改**：轻量 `classifyPlayerUtteranceRisk`（关键词 + 可选小模型）；可选 **第二遍** `control` 模型只输出 `leak_flags`（不写 narrative）。  
- **验收**：固定用例：玩家对电工提及「七锚细节」应触发 `relationship_updates` 或 narrative 中的 **合理抵触**，而非顺畅接梗。

### 阶段 5（情绪残响与欣蓝档位联动）

- **改**：`npc_attitude` spine 或 relation 扩展 **无专名**摘要；欣蓝块与 `reveal_tier` 联动。  
- **验收**：同 NPC 再次见面：无事实复述但有 **语气/距离感** 变化。

---

## F. 计划中改动文件清单（尚未实施）

| 类型 | 路径（计划） |
|------|----------------|
| Stable / 动态提示 | `src/lib/playRealtime/playerChatSystemPrompt.ts` |
| Session 记忆 | `src/lib/memoryCompress.ts`、`src/app/api/chat/route.ts`（写入字段）、`db/schema`（若加列） |
| Spine | `src/lib/memorySpine/selectors.ts`、`prompt.ts`、`types.ts`（可选标签） |
| 客户端上下文 | `src/store/useGameStore.ts` `getPromptContext` |
| Lore 组装 | `src/lib/worldKnowledge/retrieval/buildLorePacket.ts` 或 `route.ts` 拼接处 |
| NpcHeart | `src/lib/npcHeart/prompt.ts`（可选「不知清单」占位） |
| 观测 | `src/app/api/chat/route.ts` telemetry、`src/lib/debug/*`（可选） |
| 测试 | `src/lib/memoryCompress.test.ts`（若新建）、`npcHeart`、`memorySpine` 增补用例 |

---

## G. 风险点

- **过度过滤**：场景信息不足导致叙事干巴 → 需保留 **scene public** 下限与 budget。  
- **双摘要分歧**：DM 与 player_safe 摘要不一致 → 以 **结构化状态** 为准，摘要仅辅助。  
- **TTFT**：额外过滤与分类 → 必须放在 **首字后** 或极短路径（与现 TTFT 策略一致）。  
- **欣蓝例外被误用**：必须在代码层 **硬编码 N-010** 分支，避免配置扩散到「所有 NPC」。

---

## H. 建议的 Feature Flag / Telemetry / Tests

| 类别 | 建议 |
|------|------|
| **Feature flag** | `VERSECRAFT_NPC_EPISTEMIC_MODE=off|soft|strict`（soft 仅提示词；strict 启用过滤与分块） |
| **Telemetry** | `epistemic_filtered_spine_count`、`session_memory_section`、`utterance_risk_level`、按回合 `presentNpcIds` 哈希（隐私脱敏） |
| **Tests** | 单元：`selectMemoryRecallPacket` 过滤；`buildMemoryBlock` 分段；契约：JSON 输出快照不变；可选 Playwright：同场景双 NPC (secret 仅告知 A) |

---

## I. 小结（给负责人的一句话）

当前越界的 **主因** 是：**所有「记忆」类信息以全局段落进入单一 DM 上下文，且压缩记忆与 spine 提要语义上像「客观真相」**；**检索按玩家揭露档位而非说话 NPC**；**缺少玩家越界与生成后泄露的硬闸门**。  
**落地路径** 是：**在现有文件上做「分段 + 标签 + 过滤 + stable 规则」**，把 **世界真实** 与 **NPC 可引用集** 拆开，并用 **情绪残响** 补质感；**欣蓝** 仅在 **N-010 私有通道** 放宽，**不**放宽全局池。

---

*文档版本：v1 — 审计基于 2026-03 仓库状态；实施时请以当时代码为准更新锚点。*
