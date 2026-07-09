# VerseCraft 叙事连贯性 / POV 一致性 / NPC 性别代词一致性修复（v1）

本文档基于 **真实仓库代码审计**（见下列文件）给出三类核心 bug 的根因拆解与链路级修复方案。目标是让 narrative 真正像“上一段小说的自然续写”，并且在 **不破坏现有 JSON 契约、现有 SSE 形状、现有主游玩链路** 的前提下落地。

已审计关键文件（本次阶段要求）：
- `src/lib/playRealtime/playerChatSystemPrompt.ts`
- `src/app/api/chat/route.ts`
- `src/app/play/page.tsx`
- `src/features/play/stream/dmParse.ts`
- `src/lib/playRealtime/runtimeContextPackets.ts`
- `src/lib/npcHeart/prompt.ts`
- `src/lib/npcHeart/build.ts`
- `src/lib/registry/npcCanon.ts`
- `src/lib/registry/npcProfiles.ts`
- `src/lib/registry/npcs.ts`
- `src/lib/playRealtime/npcConsistencyBoundaryPackets.ts`
- `src/lib/npcConsistency/validator.ts`
- `src/lib/epistemic/validator.ts`
- `src/features/play/opening/openingCopy.ts`

---

## 1) 根因拆解（按链路分层）

### 1.1 为什么“玩家输入与 narrative 重复 / 复述 / 照搬”

**根因 A：后端把“结构标签+写作要求”塞回最后一条 user message，导致模型把标签当成正文素材。**

在 `src/app/api/chat/route.ts` 中，后端会 **替换** 마지막一条 user 消息为：
- `【系统暗骰：...】`
- `【玩家输入原文】...`
- `【写作要求】将“玩家输入原文”转写为小说叙事中的第一人称动作与对白...`

这会造成两个典型副作用：
- **“复述型承接”倾向**：模型会把 `【玩家输入原文】...` 当作需要“解释/概述/复写”的材料，而不是“上一段小说的续写触发器”。
- **“标签泄漏/机械承接”**：即便 stable prompt 明确禁止复述系统标签（`playerChatSystemPrompt.ts` 已写），模型仍会因为“标签在 user message 中极靠近、且是唯一明确结构”而在开头复写、改写或解释它（尤其在预算紧、上下文压缩或风格漂移时）。

**根因 B：stable prompt 的“承接玩家输入”规则要求把玩家输入转写为正文的一部分，并且“开头两句内呈现”，与 route 的“玩家输入原文 + 写作要求”叠加，放大了“照搬原文”的概率。**

`src/lib/playRealtime/playerChatSystemPrompt.ts` 中明确要求：
- “你必须把玩家本回合输入（动作+对白）转写为小说正文的一部分，并在 narrative 开头前两句内自然呈现”

当 route 把原文放在 user 消息里，并且还再写一次“写作要求”，模型最容易走的路径就是：**先把原文换同义词复述一遍**，以满足“前两句呈现”的硬约束——从体验上就像“我把你刚才说的再说一遍”，不像小说。

**根因 C：生成后缺少“反复读裁决器”，导致模型产出的“复述段”能直接落库。**

当前生成后校验链路（`src/lib/npcConsistency/validator.ts` + `src/lib/epistemic/validator.ts`）重点在：
- 认知泄漏（epistemic）
- offscreen 对话/老友口吻/过早真相
- 叙事节奏门闸（narrativeRhythmGate，依赖 rollout）

但 **没有一个硬规则专门裁决**：
- narrative 是否在开头大段复写 `【玩家输入原文】...` 的语义与措辞
- narrative 是否出现“解释用户输入/复述用户输入”的说明书腔（例如“你刚才做了X，所以…”）
- narrative 是否对“玩家输入原文”做高相似度覆盖（近似抄写）

因此“复读问题”目前属于 **生成时随机好坏**，而非链路闭环。

---

### 1.2 为什么 narrative 会出现“解释用户输入”而不是“续写小说”的感觉

**根因 D：输入组织把“写作任务说明”放在 user message 的最显眼位置，模型自然进入“指令执行/复述摘要”模式。**

route 的最后一条 user message 同时承担：
- 玩家行动（rawAction）
- 系统暗骰元信息
- 写作要求（meta）

这三者混在同一个 user message，且用强标签包裹，会诱发模型把这回合当成“将文本A改写成文本B”的任务，而不是“在既有故事中继续发生一段”。

**根因 E：缺少“上一段结尾→下一段开头”的硬连接信号。**

虽然有 session memory / runtime packets / playerContext，但在“这回合第一段怎么落笔”上，系统更强调“把玩家输入放进开头两句”，而不是强调“从上回合最后一句的状态继续”。当玩家动作较短（如“我点头”/“我看她”），模型容易用解释腔填充。

---

### 1.3 为什么第一人称规则写在 stable prompt 中，实际仍会漂到“你”

**根因 F：对模型的指令用“你必须…”非常多，而缺少对输出文本（narrative）的可执行裁决。**

`playerChatSystemPrompt.ts` 确实写了“保持第一人称沉浸”，但系统整体语气大量使用“你必须/你会收到/你禁止…”，模型很容易把“你”带入 narrative，尤其当它把 narrative 当作“对玩家解释”的文本而非“小说正文”时。

**根因 G：缺少生成后 POV Validator（第一人称一致性）作为最后保险丝。**

现有 post-generation 主要覆盖 epistemic 与 NPC 一致性，并未对 narrative 的 **人称视角** 做强制检查与修复（例如：出现“你走向…”、“你看到…”的第二人称叙述）。

---

### 1.4 为什么 NPC 性别代词会错（尤其灵伤等女性被写成“他”）

**根因 H：canonical identity 的性别信息虽存在，但并未形成“生成时可执行的代词约束 + 生成后可纠错的强校验闭环”。**

已存在的 canonical 基建：
- `src/lib/registry/npcCanon.ts` 提供 `canonicalGender` 等身份卡（通过 `NPCS` + `CORE_NPC_PROFILES_V2` 生成）
- `src/lib/playRealtime/npcConsistencyBoundaryPackets.ts` 会注入 `actor_canon_packet`，其中含 `g`（canonicalGender）

但目前仍会错，原因在于：
- 该 compact boundary packet 主要绑定 **focusNpcForPrompt（actor）**，对“同场其他 NPC”并未形成一份“在场 NPC→性别→允许使用的第三人称代词/称谓”的明确表。
- 生成后校验层 `src/lib/npcConsistency/validator.ts` 的 `gender_pronoun_mismatch` 判定非常保守，且当前动作是 **softenNarrativeWithHedge**（软化/打补丁式回避），并不做“把错的他→她”这类可验证纠错。

因此代词正确性仍然高度依赖模型临场猜测（硬约束 4 明确禁止）。

---

### 1.5 哪些问题来自 `route.ts` 对 last user message 的封装

**主要问题集中在：**
- 把 `rawAction` 以 `【玩家输入原文】...` 的形式直接喂给模型（高复写诱因）
- 把“写作要求”也放进 user message（任务化、解释腔诱因）
- 把 `【系统暗骰】` 放进 user message（元信息极易被复述或被当作剧情“骰子机制”而解释）

这些做法并不破坏 JSON/SSE 契约，但对叙事体验是结构性伤害。

---

### 1.6 哪些问题来自 `playerChatSystemPrompt.ts` 的“承接玩家输入”规则写法

**关键放大器：**
- “必须在 narrative 开头前两句内呈现玩家输入”在“用户输入已作为 `【玩家输入原文】` 明示”时，会促使模型采用“复述/改写原文”来完成指标。
- 规则强调“转写输入”而非强调“把输入当作已经发生的一瞬间动作，直接写后果/阻力/反应”，导致模型更像在做文本改写。

---

### 1.7 哪些问题来自前端 / commit / stream 路径

前端 `src/app/play/page.tsx` 的主链路特征：
- 客户端 **会把玩家原始输入（trimmed）作为 user log 追加**（非 system action 时）
- 发送到 `/api/chat` 的 messages 为“历史 user/assistant 对话”
- 解析 SSE 后用 `tryParseDM` 落库 narrative

**前端不是主要根因**：它没有重复注入“写作要求/系统标签”；真正的“标签注入+复读诱因”发生在后端替换最后一条 user message 的逻辑。

但前端对“复述”的治理目前为 0：它只负责协议防泄漏（展示层）与解析兜底，不做叙事一致性裁决（符合硬约束：不能由前端脑补 DM 结构）。

---

### 1.8 哪些问题来自生成后缺少文本一致性裁决

**缺少三类 Validator：**
- **Narrative Continuity / Anti-Echo Validator**：裁决“是否高相似度复写了玩家输入/是否解释用户输入/是否重复上一段内容”
- **POV（第一人称）Validator**：裁决“narrative 是否含第二人称叙述并做最小侵入修复”
- **Gender Pronoun Enforcer**：基于 canonical identity 对“在场 NPC”进行确定性代词纠错（不是软化）

目前的 `npcConsistency/validator.ts` 对 gender 的处理属于“风险缓释”，不是“根上修复”。

---

## 2) 需要新增的系统层（链路级，而非文案补丁）

### 2.1 输入组织层：Action Envelope（不破坏现有 JSON/SSE/主链路）

目标：把“元信息（暗骰/写作要求）”从 **user message** 中剥离，避免模型把它当正文素材；同时保留暗骰对剧情的影响，但让它成为 **system-side 的 runtime 事实** 或 **control augmentation**。

建议新增一个后端内部抽象（不改前端 SSE 形状）：
- `ActionEnvelope`（仅服务端使用，不暴露到前端契约）
  - `rawAction`: 玩家原始输入（用于判定与相似度校验）
  - `actionForModel`: 供模型使用的“小说触发语”（去标签化、去写作要求化）
  - `diegeticDiceHint`: 暗骰结果的“叙事化提示”（例如“本回合运气偏差/手抖/灯闪”等），作为 system augmentation 或 runtime packet，而不是放在 user content 顶部

落点文件候选：
- `src/app/api/chat/route.ts`（生成 envelope + shaping messages）
- `src/lib/playRealtime/augmentation.ts`（或新文件）增加“叙事化暗骰提示块”

### 2.2 Prompt 层：Canonical Identity → Pronoun Policy Packet

目标：让模型不再猜“他/她”，而是遵从 registry canonical identity。

新增一个紧凑 JSON packet（不影响 SSE 形状，仅 prompt 注入）：
- `npc_pronoun_policy_packet`（v1）
  - `presentNpc`: `{ npcId, name, gender, thirdPersonPronoun, addressStyle }[]`
  - `focusNpcId`
  - `playerPov`: 固定为第一人称“我”

数据来源：
- `extractPresentNpcIds(playerContext, location)` 已存在
- `getNpcCanonicalIdentity(npcId)` 已存在

落点文件候选：
- `src/lib/playRealtime/runtimeContextPackets.ts`（在 runtime packets 的 JSON 里加入此 packet，或在 `npcConsistencyBoundaryPackets.ts` 旁新增一份 compact policy）
- `src/lib/playRealtime/npcConsistencyBoundaryPackets.ts`（若追求快车道也注入，则更适合放这里）

### 2.3 生成后校验层：三段式裁决（Fail-Closed / Minimal Rewrite）

新增三个 validator（均不调用二次大模型；只做确定性规则与最小改写）：

1) `NarrativeContinuityValidator`（抗复读/抗解释腔）
- 输入：`rawAction`, `latestUserInput`, `narrative`, `playerContext`, `priorAssistantTail?`
- 输出：`narrative`（可能被裁剪/重写开头段落）、`telemetry`
- 规则：
  - 如果 narrative 含 `玩家输入原文/系统暗骰/写作要求` 等标签残留：强制删除该段（已有 stable 禁止，但需要 post 修复）
  - 如果 narrative 开头与 `rawAction` 高相似（可用 token/char n-gram Jaccard + 限制窗口 200–400 字）：将开头改为“动作已经发生后的即时反馈/后果”，并保留必要对白，不逐字复写
  - 如果出现“你刚才/你做了/你选择了/你试图…”这类解释腔：改写为“我……”第一人称动作后果（最小侵入：只改 1–2 句）

2) `PovStabilityValidator`（第一人称稳定）
- 规则：
  - 检测“第二人称叙述段”（如“你走向/你看见/你感觉”）在 narrative 前 400–600 字出现时，进行局部替换与语法修复
  - 禁止粗暴“全局替换你→我”：仅在“叙事动作谓语结构”窗口内改写；不改对话引号内的“你”（NPC 对玩家说“你”是允许的）

3) `GenderPronounEnforcer`（基于 canonical identity 的确定性纠错）
- 规则：
  - 基于 `presentNpcIds` 与 canonicalGender 建立“候选指代”表
  - 只在“叙事第三人称指代 + 说/道/问/看向/抬手”等结构附近做替换（避免误伤玩家/其他实体）
  - 从“软化”升级为“纠错”，并写入 `security_meta.npc_consistency_validator` 的细粒度记录（便于回放与回滚）

落点文件候选：
- `src/lib/npcConsistency/validator.ts`（新增 violation type 与 rewrite 分支，或拆到新模块）
- `src/lib/epistemic/validator.ts`（保持其专注认知泄漏；不建议把 POV/性别塞进去，避免职责混乱）

---

## 3) 需要修改的 prompt 规则（不是只加一条规则）

### 3.1 `playerChatSystemPrompt.ts`：从“转写原文”升级为“以原文为触发，写后果而非复写”

当前规则强调“转写玩家输入并在前两句呈现”，建议调整为：
- **禁止复写原文措辞**：允许吸收意图（行动/对白），但开头两句必须主要写“动作发生后的反馈/阻力/对方反应”，而非把动作本身同义改写一遍。
- **把“承接”定义为“从上一段结尾延续”**：明确要求首段必须引用上回合末状态（环境/人物姿态/未完成动作）中的至少一项（由 memoryBlock / runtime packet 给出），以形成段落连贯。

### 3.2 将“暗骰”从 user message 移出，改为 system augmentation（叙事化）

暗骰仍可以保留，但建议：
- system 中注入“本回合检定倾向”的叙事提示（不出现“骰子/roll/数值”）
- 或放入 runtime packet（如 `tactical_context_packet` 的一个字段），由 DM 自然体现

---

## 4) 需要新增的 validator（明确职责与接口）

新增文件建议（v1）：
- `src/lib/playRealtime/narrativeContinuityValidator.ts`
- `src/lib/playRealtime/povValidator.ts`
- `src/lib/playRealtime/genderPronounEnforcer.ts`

并在 `src/app/api/chat/route.ts` 的 final hooks（在 `applyNpcConsistencyPostGeneration` 之后、`resolveDmTurn` 之前或之后，需明确顺序）接入：
- 先做 **continuity/pov/gender**（只改 narrative）
- 再 `resolveDmTurn` 收口
- 输出审核/最终审核保持不变

顺序建议（理由：避免 resolver/审核读到未裁决的脏文本）：
1) 协议 guard（已有）
2) options fallback（已有）
3) **continuity/pov/gender validators（新增）**
4) `applyNpcConsistencyPostGeneration`（可保留，用于 offscreen/老友/真相等）
5) `resolveDmTurn`
6) 输出审核（已有）

---

## 5) 需要修改的 runtime packet（把 canonical identity 变成“可执行约束”）

### 5.1 `npcConsistencyBoundaryPackets.ts`：从“actor focus 卡片”扩展为“在场 NPC 身份约束”

当前 `actor_canon_packet` 只覆盖 focus NPC。建议新增一个 compact 列表（不必很长，限制 3–6 个）：
- `present_canon_packet`: `[{ id, name, g, ap_s }]`
- 并明确给出 `third_person_pronoun`（male→他，female→她，unknown→TA/对方/这人）

### 5.2 `runtimeContextPackets.ts`：若 full runtime 不空，加入 `npc_pronoun_policy_packet`

这能覆盖“同场多个 NPC 时代词错”的主要场景。

---

## 6) 需要补的测试（至少覆盖 4 类）

新增/扩展测试建议：

1) **复读/复述回归测试**
- 输入：`latestUserInput="我压低声音问她：你是谁？"` + route shaping 后的 messages
- 断言：生成后 narrative 的前 200 字不应包含 `【玩家输入原文】` 文本、不应高相似复写 action 原句、不应出现“你刚才…”解释腔

2) **POV 稳定测试**
- 构造 narrative 中出现“你走向门口…”并包含 NPC 对话里的“你”
- 断言：validator 只改叙事第二人称，不改引号对白内的“你”

3) **性别代词纠错测试（灵伤 N-020）**
- 给定 presentNpcIds 包含 `N-020` 且 canonicalGender=female
- 构造 narrative 含“他轻声道”且明显指向灵伤（可通过邻近出现“灵伤”）
- 断言：纠错为“她轻声道”，且不触发大段重写

4) **快车道/空 runtime 下仍生效**
- `fastLaneSkipRuntimePackets=true`，只注入 compact boundary
- 断言：pronoun policy 仍可从 boundary compact 注入或从 registry 构建，纠错仍生效

落点文件候选：
- `src/lib/npcConsistency/phase8GoldenScenes.test.ts`（可新增类似 golden）
- `src/lib/npcConsistency/narrativeRhythmValidators.test.ts`（扩展）
- 或新增 `src/lib/playRealtime/*.test.ts`

---

## 7) 修复优先级（P0/P1/P2）

### P0（立刻止血，最小风险）
- **P0-1**：`route.ts` 把 `【写作要求】` 从 user message 移出（改为 system augmentation），并把 `【玩家输入原文】` 改为无标签、低可复写的“行动意图描述”（仍保留 rawAction 供校验）
- **P0-2**：新增生成后 `PovStabilityValidator`（只动 narrative，局部改写）
- **P0-3**：新增 `GenderPronounEnforcer`（基于 canonical identity，对在场 NPC 做确定性纠错）

### P1（体验提升：让它像小说续写）
- **P1-1**：新增 `NarrativeContinuityValidator`（抗复述、抗解释腔、强化“后果先行”）
- **P1-2**：prompt 规则改造：从“转写输入”转为“写后果+反应+微细节”
- **P1-3**：runtime packet 增补 `npc_pronoun_policy_packet`

### P2（完善与长期稳态）
- **P2-1**：把 continuity/pov/gender 的 telemetry 接到现有 analytics（便于线上观测）
- **P2-2**：扩展 narrativeRhythmGate 将“复述型承接”纳入 violationTypes（可选）

---

## 8) 风险与回滚策略

### 风险点
- **风险 1：改 messages shaping 可能改变模型输出风格**（但不改 JSON/SSE 契约）
- **风险 2：生成后改写可能误伤对白**（尤其“你/我”在引号内外的边界）
- **风险 3：代词纠错可能误判指代对象**（同段多人物时）

### 缓解与回滚
- **灰度开关**：复用现有 rollout flags 体系（类似 `enableNpcConsistencyValidator` / `enableNarrativeRhythmGateAny`），为三类新 validator 各加一个开关，默认只在非首回合、非 options_only、非终局路径启用。
- **Fail-open vs Fail-closed**：
  - POV/性别/复读修复建议 **fail-open**（出错则不改写，只记录 telemetry），避免把 narrative 变空
  - 标签泄漏（`【玩家输入原文】` 等）可 **fail-closed 删除标签段**，因为这是明确违规且对体验伤害极大
- **回滚**：任何线上异常可通过 env flag 直接关闭新 validator；`route.ts` shaping 的调整可保留旧实现作为 legacy 分支（但不建议长期双轨）。

---

## 附：三大 bug 的“链路级”一句话结论

1) **上下文不连贯/复述**：根因是 `route.ts` 把“玩家输入原文+写作要求+系统暗骰”以强标签注入最后一条 user message，触发模型改写/复述任务模式；同时缺少生成后 anti-echo 裁决，导致复述段直接落库。
2) **POV 漂到“你”**：根因是 prompt 只“要求第一人称”但没有生成后 POV 裁决与最小修复；模型在任务化输入组织下倾向用“你”对玩家解释。
3) **NPC 性别代词错**：根因是 canonical identity 虽存在，但没有形成“在场 NPC→性别→可执行代词策略”的 prompt 注入与生成后确定性纠错闭环；现有 validator 仅软化，不纠错。

