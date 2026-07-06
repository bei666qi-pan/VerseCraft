# VerseCraft 深度调研报告：AI 互动叙事游戏的核心挑战与可落地方案

> 调研日期：2026-07-06
> 方法：多角度并行 Web 搜索 → 22 个源提取 92 条声称 → 25 条关键声称经 3 人对抗验证 → 16 条通过、9 条被驳斥
> 代码库对标：基于当前 `main` 分支实际代码状态

---

## TL;DR

VerseCraft 的五个问题可以收敛为三个技术瓶颈和一个方法论缺口：

| 瓶颈 | 根因 | 最短路径 |
|---|---|---|
| **AI ↔ 数值系统不可靠** | 模型自由文本输出 → 正则/解析器收口，缺少结构化中间层 | 引入 Worldsmith 模式的 Plan Primitive 桥接层 |
| **NPC/世界观扁平** | 记忆系统缺语义层（REVERIEMEM 证明：去语义层后知识保真度从 73.3 → 17.8） | 在现有 memorySpine 上补语义记忆层 + NPC 人格卡 |
| **留存断层** | 缺少叙事闭合感、跨周目变化预期、后果可发现性三个钩子 | 章回体收束 + 结算履历可视化 + 世界状态持久化 |
| **叙事文风 & 评估** | 学术界空白 — 无标准化 benchmark | 自建回归测试套件 + LLM-as-judge + 人工评分混合 |

**核心原则：不要改主链路架构**。VerseCraft 的 9 阶段 turn compiler 设计是业界领先的。问题是**已有系统未充分激活**，而非架构需要重写。

---

## 1. AI 叙事与游戏数值系统的深度联动

### 1.1 问题本质

当前代码中：
- **道具系统**：`resolveNarrativeInventoryItems` / `resolveNarrativeWarehouseItems` 从 DM JSON 中解析 `awarded_items` / `consumed_items` 文本字段
- **任务系统**：`GameTaskV2` 有完整的 task state machine，但 AI 只能通过 `task_updates` / `new_tasks` 文本字段触发
- **职业系统**：7 个职业（`PROFESSION_REGISTRY`），含试炼任务、认证引擎、被动/主动技能，但 AI 几乎不感知职业状态
- **原石货币**：`originium` 字段存在，有恢复理智（1原石=1理智）机制，但 AI 不主动操作
- **武器系统**：`WeaponSlotPanel`、武器注入（`tickInfusions`）、装备执行（`equipmentExecution.ts`）、B1 安全守卫（`b1Safety.ts`）

**核心矛盾**：AI 输出自由文本，服务端用解析器/正则从文本中捞结构化字段 → 信息损耗大、不可靠、无法做双向交互。

### 1.2 学术证据

**RPGBench (arXiv 2502.00595)** 对 10+ 前沿模型的自动化验证证明：
- 最强模型 Gemini 2.0 Flash Exp 的 Mechanic Score 仅 **0.765**（约每 4 回合就有 1 回合包含规则/状态错误）
- GPT-4o 生成游戏中仅 **49%** 具有逻辑可达的成功/失败结局
- DeepSeek V3 的 Mechanic Score 仅 **0.277**

**ACL 2024 Wordplay Workshop 论文** 通过 5 组对照实验证明：
- Function calling 双通道（掷骰 + 状态更新）的叙事一致性达 **4.378/5**
- 比完全不使用 function calling 的 3.496/5 高出 **25%**（p=0.0001）
- 仅做 state roll 而不做 state update 的一致性反降至 3.422，说明**写回状态比读取状态更关键**

### 1.3 最佳实践参考

#### Worldsmith（npm `worldsmith` v0.2.0，宾大 + AWS）

核心理念：**8 种类型化的 Plan Primitive，LLM 输出 JSON 数组，游戏引擎注册回调执行**。

```
mutate    → 修改游戏状态（增减 HP/原石/物品）
roll      → 请求掷骰（技能检定、战斗判定）
resolve   → 基于掷骰结果解析行动成败
remember  → 写入长期记忆
emit      → 向前端发送 UI 事件（特效、音效）
do        → 触发预定义动作
move      → 移动实体
for_each  → 批量操作
```

**架构原则**：游戏拥有数据和渲染，引擎拥有编排和记忆。LLM 只输出 primitive plan，不直接操作状态。

#### The World SDK（GitHub: LyalinDotCom/the-world）

设计哲学：**游戏引擎拥有最终权威，模型仅能 propose 事件**。

`GameAIEventSchema` 约束 LLM 可提出的事件类型仅限于非权威型操作（`dialogue.say`、`npc.emotion`、`quest.propose`），引擎裁决后再执行。

### 1.4 对 VerseCraft 的具体方案

#### 短期（1-2 周）：激活现有系统，让 AI 感知游戏状态

VerseCraft 的问题不是"没有系统"，而是**系统已存在但 AI prompt 里看不到**。

**方案 1a：扩展现有 `runtimePackets` 增加数值状态块**

当前 `runtimePackets` 已包含约 30+ 个 packet builder（floor lore、NPC arc、cycle time、threat、weapon、worldview 等）。在此基础新增：

```typescript
// 新建 src/lib/playRealtime/gameStatePacket.ts
buildGameStatePacket(store) → {
  originium: number,
  hp: number,
  sanity: number,
  profession: { id, name, activeSkillName, passiveSummary },
  inventory: [{ id, name, quantity }],
  activeTasks: [{ id, title, status }],
  equippedWeapon: { id, name, damage },
  talentCooldowns: [{ name, remaining }],
}
```

注入到主 prompt 的 `dynamicSuffix` 中，让 AI **每回合都看到**玩家数值快照。

**成本**：约 200 行纯函数 + 1 个 prompt block。不改主链路，只加一个 packet。

**方案 1b：在 DM JSON Schema 中补齐数值操作字段**

当前 DM JSON 已定义但未被 AI 可靠填充的字段：

```json
{
  "awarded_items": [{"id": "origin_stone", "name": "原石碎片", "quantity": 1}],
  "consumed_items": [{"id": "bandage", "quantity": 1}],
  "currency_change": {"originium": 1},
  "new_tasks": [{"taskId": "T001", "title": "调查楼梯间的血迹"}],
  "task_updates": [{"taskId": "T000", "status": "completed"}]
}
```

**加强方案**：在 `normalizePlayerDmJson.ts` 新增「结构化字段互斥校验」——如果 `narrative` 文本说"你捡到了一块原石"但 `awarded_items` 为空，则触发 `inventory_conflict` validator（已有此检查），并**自动回填缺失的结构化字段**。

**方案 1c：给 DM prompt 加数值操作"示例块"**

在 prompt 中给 2-3 个具体示例，教模型如何正确填充结构化字段。当前 styleBible 只覆盖文风，不覆盖数值操作的正确模式。

#### 中期（1-2 月）：引入 Plan Primitive 桥接层

在现有 `resolveDmTurn` 之外，新增一个轻量级的 **Action Resolver**：

```
DM JSON 候选
  → resolveDmTurn (现有，处理 narrative + state delta)
  → ActionResolver (新增，处理 plan primitives)
    → mutate? → 写 store
    → roll? → 执行掷骰并写结果到 prompt context
    → remember? → 写 memorySpine
  → commitTurn (现有)
```

这不会改变主链路——turn compiler 的 9 阶段保持不变——只是在 Phase 7 (resolveDmTurn) 内部新增一个处理步骤。

**关键设计：不要求 AI 输出 plan primitives**（那是远期目标）。而是从 AI 现有的 DM JSON 文本字段中**反向提取** primitive——例如从 `awarded_items` 提取 `mutate`，从 `task_updates` 提取 `do`，从战斗叙事中提取 `roll`。

---

## 2. 世界观与角色立体化

### 2.1 问题本质

VerseCraft 已有：
- **World Knowledge RAG**：4 层（core_canon / shared_public_lore / user_private_lore / session_ephemeral）
- **Epistemic Filter**：5 个认知桶（dmOnly / scenePublic / playerOnly / actorScoped / residueFacts）**已接入 prompt**
- **NPC Consistency**：post-generation validator + rewrite（Phase 6）
- **Memory Spine**：extract → reduce → prune → recall pipeline
- **NPC Heart**：`buildNpcHeartPromptBlock`
- **Story Director**：`buildDirectorPromptBlock`
- **Canon Name Validator**、Personality Validator、POV Validator、Foreshadow Validator 等

**但问题在于**：
1. 现有 RAG 是**无状态的**——每次检索基于当前输入，不追踪"NPC 已经知道了什么"
2. 记忆系统缺少**语义层**——REVERIEMEM 证明这是最关键的层次
3. 认知过滤已接回 prompt，但 `runtimePackets`（30+ 个独立 packet builder）作为**并行的独立内容通道**，尚未逐个审计认知边界

### 2.2 学术证据

**REVERIEMEM (arXiv 2606.25632, UNSW + 悉尼大学 + 阿里通义, 2026 年 6 月)**：
- 三层架构：Episodic（情节记忆） + Semantic（语义/世界观知识） + Personality（人格特征）
- 消融实验：完整系统 KBF（知识边界保真度）= 73.3，去语义层 → **17.8**，去情节层 → 60.9
- 诊断的两个失败模式：Factual Overreach（共享检索导致角色获取视角外事实）、Stylistic Monotony（固定描述扁平化角色声音）

**Runtime-swappable Memory (arXiv 2511.10277, 奥胡斯大学, 2025 年 11 月)**：
- 单个 SLM 模型实例 + 可热插拔记忆模块，可在 **<30ms** 内切换 NPC 记忆
- 单模型实例支持数百 NPC，避免每个 NPC 维护独立 LLM 连接
- 前提是需要 fine-tuned 的小模型（非 VerseCraft 当前架构可直接复用）

**PANGeA (AAAI AIIDE 2024)**：
- Big 5 人格模型百分比显式编码入 NPC 生成 prompt
- LLM 自反思校验系统将一致性准确率从 28% 提升至 **98%**

### 2.3 对 VerseCraft 的具体方案

#### 短期（1-2 周）：NPC 人格卡 + 认知边界审计

**方案 2a：为关键 NPC 创建结构化人格卡**

当前 NPC 信息散落在 world knowledge RAG、prompt packet 和硬编码的 NPC 关系中。为每个主要 NPC 建立一个显式的**人格卡**：

```typescript
// 放在 src/lib/npcHeart/ 或新建 src/lib/npcPersona/
type NpcPersonaCard = {
  npcId: string;
  name: string;
  big5: { openness, conscientiousness, extraversion, agreeableness, neuroticism }; // 1-10
  voice: string[];        // 说话方式特征：["短句", "反问", "从不直接回答"]
  knows: string[];        // fact IDs NPC 已知道
  doesNotKnow: string[];  // fact IDs NPC 明确不知道（防止泄露）
  goals: string[];        // 当前动机
  fears: string[];        // 恐惧/避讳
  relationships: Record<string, { attitude, history }>; // 对其他角色的态度
}
```

这个卡片在 prompt assembly 阶段注入，让 AI 在生成该 NPC 对话时有明确的约束。

**成本**：约为 3-5 个主要 NPC 手动编写人格卡（每个约 30 分钟），代码侧约 200 行。

**方案 2b：RuntimePackets 认知边界审计**

当前 CLAUDE.md 文档中已明确指出此问题：

> `runtimePackets`（约 30+ 个独立 packet builder）是一条与 typed epistemic filter **并行的独立内容通道**，尚未逐个审计是否每个 packet 都严格遵守认知边界。

建议做一次分类盘点：
1. 列出所有 30+ packet builder 的文件路径和内容摘要
2. 标注每个 packet 的信息类别：场景公共 / NPC 专属 / DM-only / 玩家私密
3. 对标注为 DM-only 但注入了 prompt 的 packet，加 epistemic guard

**成本**：半日审计 + 少量 guard 代码。

#### 中期（1-2 月）：语义层记忆 + Lore 可发现性

**方案 2c：在 MemorySpine 补语义记忆层**

当前 memorySpine 更偏情节记忆（发生了什么事）。新增一个独立的语义记忆层：

```typescript
// 概念：src/lib/memorySpine/semanticLayer.ts
type SemanticMemory = {
  factId: string;
  content: string;
  discoveredBy: string[];  // 哪些 NPC / 玩家知道这个事实
  discoveredAt: number;    // 回合号
  confidence: number;      // 确信度（传闻 = 0.3，亲眼所见 = 1.0）
  source: string;          // 来源描述
}
```

这直接对标 REVERIEMEM 的 Semantic Layer——维护"谁知道什么"的显式记录，防止 Factual Overreach。

**方案 2d：Lore 分层揭示机制**

当前 world knowledge 的 `maxRevealRank` 已定义了 0-3 级揭露深度。但缺少 **渐进式揭示** 的叙事节奏控制：

- **Surface (0)**：场景描述级，玩家不需要任何前提就能感知
- **Shallow (1)**：调查 1 次或对话 1 次可获得的线索
- **Deep (2)**：需要组合 2+ 条线索或特定 NPC 信任后才能解锁
- **Abyss (3)**：世界观核心真相，仅特定结局路径揭示

在 story director 中补一个 `revealGate` 检查：在 prompt 注入前判断当前玩家的 `computeMaxRevealRankFromSignals` 是否达到该条 lore 的门槛。

---

## 3. 玩家留存与新鲜感

### 3.1 问题本质

当前 VerseCraft 的 session 结构是：
- `/create` → `/play`（无限循环）→ `/settlement`（死亡/结局时）
- 缺少明确的**中期目标**、**跨 session 钩子**、**世界状态持久化**

### 3.2 学术证据

**ICIDS 2023 (Yong & Mitchell, NUS)** 通过 AI Dungeon 玩家的定性研究（n=10）识别出三个留存驱动力：
1. **叙事闭合感**：寻求满意结局的欲望
2. **叙事不连贯性驱动的"修复性重玩"**：逻辑缺口促使玩家重玩来"修复"故事
3. **跨周目变化预期**：期望不同流程中有不同结果

研究还发现玩家会从"玩故事"过渡到"**玩系统**"（gaming the system）——主动探测和利用 LLM 行为模式。这是否该被抑制是开放问题。

**AI Dungeon Memory System**：
- 每 6 个动作触发一次 AI 摘要生成
- 摘要存储为嵌入向量，检索时相似度排序
- 作为"规模最大、实践验证时间最长"的长叙事记忆方案

### 3.3 对 VerseCraft 的具体方案

#### 短期（1 周）：章回体收束 + 结算履历可视化

**方案 3a：章回体收束**

VerseCraft 已有 Chapter 系统（`src/lib/chapters/`），包含 `ChapterNavigator`、`ChapterEndSheet`、`ChapterSummaryList` 等 UI 组件。问题是 AI 不主动推进章回节奏。

在 prompt 中注入当前章回的**余量信息**：
- "当前是第 2 章（共 5 章），距离本章结束还有约 3-5 回合"
- "本章的核心冲突尚未解决：{chapterObjective}"
- "当本章结束时，展示 ChapterEndSheet 总结"

**方案 3b：结算履历增强**

`settlementHistories` 表已设计但信息维度偏少。增强结算履历使其成为**可回访的内容资产**：
- 写作导出的 markdown 已存储（`writingMarkdown`）
- 增加：关键 NPC 关系网络快照、获得的重要物品、未完成的任务线索
- 在首页 `/` 展示最近一次结算的"故事回顾"卡片

**方案 3c：世界状态持久化（小范围）**

当前每个 run 是独立的世界。选择性做少量**世界级持久化**：
- 玩家在上一轮解锁的 lore（`computeMaxRevealRankFromSignals`）在新 run 中保留
- 新 run 中 NPC 可能说"我有一种奇怪的既视感……"
- 给老玩家一个**小小的跨周目彩蛋**，而非完整的 New Game+

#### 中期（1-2 月）：后果发现系统 + 叙事分支可视化

- **后果发现**：当玩家做了一个关键选择后，3-5 回合后再展示该选择的后果（而非立即），创造"原来那件事导致了现在这个局面"的恍然大悟
- **叙事分支可视化**：类似 Telltale 的"你的选择影响了……"总结页，在章回结束时展示关键分支点
- **玩家目标系统**：让玩家在 session 开始时设定一个"本章目标"（如"找出暗月的真相"），DM 围绕此目标编排叙事节奏

---

## 4. 叙事文风吸引力

### 4.1 问题本质与学术现状

**重要发现**：本次调研的 16 条通过对抗验证的 claim 中，**无一条直接涉及叙事文本的文学质量、风格控制或中文文学性写作**。这是一个学术界的关键空白——游戏机制一致性有 RPGBench，记忆管理有 KBF-QA，但叙事文风没有标准化 benchmark。

**但这不意味着 VerseCraft 没有改进空间**。当前 VerseCraft 已有 `styleBible.ts`，定义了：
- 4 个 tone 方向（青春校园与都市异闻交叠、命运感与悲剧底色等）
- POV 策略（第一人称沉浸式）
- 句子节奏策略（长句蓄势、短句收束）
- 对话策略（对白锋利、NPC 不替世界观做完整讲解）
- 12 个意象词库（教室黑板、校服袖口、雨水、旧登记册等）
- 禁止短语列表

### 4.2 可落地方案

#### 短期（1 周）：Few-shot 示例注入 + 叙事标签化

**方案 4a：在 prompt 中注入 1-2 个"金标准"叙事片段**

从你认为写得最好的 2-3 个叙事回合中提取片段，注入到 system prompt 作为 few-shot 示例：

```
【文风参考范例】
以下是你之前写出的一段高质量叙事，请保持相同的节奏、密度和画面感：

「我的手电筒光在走廊尽头晃了一下。有什么东西从光柱边缘滑过去了——不是影子，影子不会留下黏液。
  我屏住呼吸，数到三，把光照向那个方向。什么都没有。但空气里的铁锈味浓得呛人。
  廖暗在身后说："你也闻到了？"
  我点头，不敢开口。因为我知道那个味道——那是血。很多血。」
```

**方案 4b：叙事质量的多维度标签化**

在 `styleValidator.ts` 已有的 `style_drift` 和 `mechanical_exposition` 检测之外，增加更细粒度的检测：
- **画面感**：叙事中是否包含至少 2 个感官描述（视觉/听觉/嗅觉/触觉）
- **节奏变化**：是否包含至少 1 处长句（>30 字）和 1 处短句（<10 字）
- **对话落地**：每段对话之后是否有动作/神情/环境回响跟上
- **信息密度**：每 100 字是否至少包含 1 个"新信息"（非重复/废话）

这些不是硬性拦截，而是**评分后写入 telemetry**，用于回归对比。

#### 中期（1-2 月）：多模型风格对比 + 人工评分 pipeline

- 定期用同一组 prompt 在不同模型上生成叙事，做横向风格对比
- 建立 3-5 人的内部评分小组（可包含你自己 + 2-4 个朋友），每两周评一次
- 用 `eval:chat-quality:mock` 脚本跑全量 eval case，对比不同 prompt 版本的综合得分

---

## 5. 内容质量评估与回归测试体系

### 5.1 当前状态

VerseCraft 已有相当完整的评估基础设施：

| 工具 | 用途 |
|---|---|
| `pnpm test:unit` | 全部单测（含 turnEngine SSE/validator/commitTurn 等） |
| `pnpm test:e2e:chat` | SSE 契约 E2E |
| `pnpm test:e2e:contract` | chat latency + SSE + play opening 三重契约 |
| `pnpm benchmark:chat:mock` | mock chat 延迟预算验证 |
| `pnpm eval:chat-quality:mock` | 叙事质量评估（182 行 eval cases） |
| `pnpm eval:narrative-safety:mock` | 叙事安全评估 |
| `pnpm eval:npc-consistency:mock` | NPC 一致性评估 |
| `pnpm eval:authenticity` | 真实性评估 |
| `pnpm eval:player-echo` | 玩家回声评估 |
| `pnpm eval:director` | story director 评估 |
| `pnpm eval:social-world` | 社交世界评估 |
| `pnpm benchmark:world-retrieval` | 世界知识检索 benchmark |

**但核心问题是**：
1. Eval cases 数量有限（约 15-20 个，覆盖度不够）
2. 缺少**回归对比**机制（改 prompt 前 vs 改 prompt 后）
3. 缺少**自动门禁**（CI 中只跑 lint + unit + build，不跑 eval）
4. 缺少**探索性测试**（只测已知 case，不测未知边缘）

### 5.2 学术证据

RPGBench 的设计模式值得借鉴——它用**自动化验证**（BFS 搜索事件可达性）而非 LLM-as-judge 来做游戏机制一致性评估。这避免了"用 LLM 评价 LLM"的循环问题。

### 5.3 可落地方案

#### 短期（1 周）：Golden Test Suite + 回归对比脚本

**方案 5a：建立 Golden Test Cases**

从之前的真实玩家 session 或你手动测试中，提取 10-15 个"曾经通过但现在可能退化"的关键场景，加入 `benchmarks/llm-evals/cases.json`：

- 战斗高规则场景（weapon + combat state）
- NPC 一致性场景（NPC 不应该知道的信息）
- 道具/原石联动场景
- 任务状态推进场景
- 死亡/结局触发场景

每个 case 定义硬性断言（`mustNotContain`、`mustContainAny`）作为回归门禁。

**方案 5b：回归对比脚本**

写一个简单的 diff eval 脚本：

```bash
# 思路：跑两次 eval，对比结果
pnpm eval:chat-quality:mock --json-out .runtime-data/eval-before.json
# 改 prompt 后
pnpm eval:chat-quality:mock --json-out .runtime-data/eval-after.json
# diff 对比
node scripts/diff-eval-results.mjs .runtime-data/eval-before.json .runtime-data/eval-after.json
```

输出：每个 eval case 的得分变化、新增 regression 标记、整体 gate pass/fail。

#### 中期（1-2 月）：CI 门禁 + 分层评估体系

**方案 5c：CI 中接入 eval gate**

`pnpm test:ci` 当前只跑 lint + unit + build。增加 eval gate：

```bash
pnpm test:ci  # 扩展后
  → npx eslint .
  → pnpm test:unit
  → pnpm eval:chat-quality:mock --assert   # 新增：质量门禁
  → pnpm eval:npc-consistency:mock --assert # 新增：一致性门禁
  → pnpm build
```

用 `--assert` 标志让 eval 脚本在 gate 未通过时返回非 0 退出码。

**方案 5d：分层评估体系**

| 层级 | 频率 | 内容 | 成本 |
|---|---|---|---|
| **预提交** | 每次 commit | lint + unit tests (~30s) | 本地 |
| **PR门禁** | 每次 PR | 上面 + eval:quality + eval:safety (~3min) | CI |
| **每日** | 每天一次 | 全量 eval suite + benchmark (~10min) | CI cron |
| **每周** | 每周一次 | 人工评分 5-10 个随机样本 + 多模型对比 | 人工 |
| **发版前** | 每次发布 | 全量 eval + 人工回归测试 + release notes | 人工 + CI |

---

## 6. 优先级路线图

### 第一优先级：激活存量（1-2 周）

这些都是**不改主链路、只补 prompt/schema/telemetry**的低风险改动：

| # | 改动 | 解决哪个问题 | 预估工时 | 验证方式 |
|---|---|---|---|---|
| 1 | 新增 `gameStatePacket` 让 AI 每回合看到数值快照 | AI-数值联动 | 4h | unit test + eval 对比 |
| 2 | DM JSON Schema 补数值操作示例块 | AI-数值联动 | 2h | eval:chat-quality:mock |
| 3 | 为主要 NPC 编写人格卡 | 角色立体化 | 3h | eval:npc-consistency:mock |
| 4 | runtimePackets 认知边界审计 | 世界观一致性 | 4h | 人工 review |
| 5 | prompt 中注入章节余量信息 | 留存/新鲜感 | 2h | eval:chat-quality:mock |
| 6 | 结算履历增强 | 留存/新鲜感 | 3h | unit test |
| 7 | Golden Test Cases 扩展（+15 cases） | 评估体系 | 4h | eval suite 全部通过 |
| 8 | 叙事质量多维度标签化 checker | 文风 + 评估 | 3h | unit test + telemetry 验证 |

**总工时**：约 25h（3-4 个工作日）

### 第二优先级：补关键能力（2-4 周）

这些需要新增模块但不改主链路：

| # | 改动 | 解决哪个问题 | 预估工时 |
|---|---|---|---|
| 9 | Action Resolver（从 DM JSON 反向提取 plan primitives） | AI-数值联动 | 12h |
| 10 | 语义记忆层（Semantic Memory Layer） | 世界观立体化 | 16h |
| 11 | Lore 分层揭示 gate | 世界观发现感 | 8h |
| 12 | 回归对比脚本（diff eval） | 评估体系 | 6h |
| 13 | CI 中接入 eval gate | 评估体系 | 4h |
| 14 | Few-shot 金标准叙事示例注入 prompt | 文风 | 4h |
| 15 | 章回结束叙事总结 UI | 留存 | 8h |

**总工时**：约 58h（7-8 个工作日）

### 第三优先级：体系化建设（1-3 月）

| # | 改动 | 解决哪个问题 |
|---|---|---|
| 16 | Plan Primitive 桥接层（LLM 原生输出 primitives，非反向提取） | AI-数值联动 |
| 17 | 世界状态跨周目持久化（New Game+ lite） | 留存 |
| 18 | 分层评估 CI 流水线（预提交/PR门禁/每日/发版前） | 评估体系 |
| 19 | 多模型叙事风格横向对比 pipeline | 文风 |
| 20 | NPC 关系网络可视化 + 叙事分支图 | 世界观 + 新鲜感 |
| 21 | Player Goal System（玩家自设章节目标） | 留存 |

---

## 7. 调研局限性

1. **叙事文风评估**是本次调研的最大知识空白——学术界尚无标准化的叙事文学质量 benchmark，中文学术文献更少。
2. 玩家留存的三动机来源单一（NUS 的 n=10 定性研究），且基于英文 AI Dungeon 旧版本（GPT-3/GPT-J 时代）。
3. REVERIEMEM（2026 年 6 月）非常新，尚未经广泛社区验证；FictionRAG 发表于 MDPI 期刊，该出版商审稿质量存在争议。
4. 所有 function calling 和游戏桥接研究均基于英文 LLM——中文大模型在游戏机制一致性上的表现可能显著不同。
5. Worldsmith 和 The World SDK 均为较新的开源项目，可持续性和社区规模待观察。

---

## 8. 关键参考源

| 源 | 链接 | 类型 |
|---|---|---|
| RPGBench | https://arxiv.org/abs/2502.00595 | 学术论文（ICML 2025 投稿） |
| Wordplay Workshop (function calling) | https://ar5iv.labs.arxiv.org/html/2409.06949 | 学术论文（ACL 2024） |
| Worldsmith | https://www.npmjs.com/package/worldsmith | 开源 npm 包 |
| The World SDK | https://github.com/LyalinDotCom/the-world | 开源项目 |
| REVERIEMEM | https://arxiv.org/abs/2606.25632 | 学术论文（2026.06） |
| FictionRAG | https://doi.org/10.3390/a19050383 | 学术论文（2026） |
| Runtime-swappable Memory | https://arxiv.org/abs/2511.10277 | 学术论文（2025.11） |
| PANGeA | http://export.arxiv.org/abs/2404.19721 | 学术论文（AAAI AIIDE 2024） |
| AI Dungeon Memory | https://help.aidungeon.com/faq/the-memory-system | 官方产品文档 |
| ICIDS 2023 Retention Study | https://dl.acm.org/doi/10.1007/978-3-031-47655-6_24 | 学术论文 |

---

> **下一步建议**：从第一优先级的 8 个改动中，选 1-2 个最高杠杆的（推荐 #1 gameStatePacket + #7 Golden Test Cases）先动手。这两个改动加起来不超过 8 小时，但能立即验证"AI 看到数值后行为是否改善"——这是决定后续投入方向的关键实验。
