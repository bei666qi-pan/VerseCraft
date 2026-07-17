# Phase 1：把风格宪法落进全部文风源

> **目标**：让 STYLE_BIBLE v3 成为模型实际拿到的指令与判据——重写四处文风源，同步全部测试/评测锚，用 phase-0 的尺子验收到达标为止。
> **前置**：phase-0 完成。**预计**：2–3 个会话。
> 本阶段完成后建议用户用真实网关试玩 10 回合做人工验收。

---

## 0. 开始前必读

- `docs/narrative-refactor/STYLE_BIBLE.md` 全文（重点 §1–§7、§10、§11、§12）
- `src/lib/playRealtime/playerChatSystemPrompt.ts` **全文**，特别是：【最高优先级·平台身份】段、【叙事风格】段、【叙事长度·情景自适应】段、【承接玩家输入=自然续写】段、【POV·第一人称硬约束】段、`buildCompactStablePlayerDmSystemLines()`、`buildStyleGuidePacketBlock()`、文件头关于 bump `VERSECRAFT_DM_STABLE_PROMPT_VERSION` 的注释
- `src/lib/narrativeStyle/styleBible.ts` / `styleExamples.ts` / `styleValidator.ts`
- 测试锚：`src/lib/playRealtime/playerChatSystemPrompt.test.ts`、`playerChatSystemPrompt.canonNpcRoster.test.ts`、`playerChatSystemPrompt.professionConsistency.test.ts`、`ruleSnapshot.test.ts`
- 评测锚：`src/lib/ai/mock/mockScenarios.ts`、`e2e/fixtures/endingMocks.ts`、`benchmarks/llm-evals/cases.json`、`promptfooconfig.yaml`、`tests/promptfoo/assertions/schema-validators.ts`
- `scripts/gen-player-chat-stable-prompt.mjs`（先读懂用途与产物再运行）与 `pnpm prompts:regen:verify` 对应脚本

---

## 1. 目标与非目标

**目标**：文风四源 v3 化；few-shot 更新；测试/评测锚同步；评测迭代到达标。

**非目标**：不动节奏引擎与 packet 注入（phase-2）；不动开场正文与开局任务文案（phase-3）；不动 NPC canon 内容（phase-4）；不改 DM JSON 契约；不改 maxTokens tier 数值与 `narrativeBudgetPackets.ts` 逻辑。

---

## 2. 执行步骤

### 1.1 盘点消费方与断言（不改代码）

1. grep 列出四处文风源的全部消费方；列出 prompt 测试中 `toContain` 断言的具体字符串（这些断言在 1.3 改文案后会挂，必须先知道有哪些）。
2. grep `style_profile_id` 与 `youth_campus_suspense_v2` 的全部出现点（遥测、缓存、评测），判断改 id 是否有硬依赖。
3. grep `mockScenarios` 三段叙事文本的关键词在 `benchmarks/llm-evals/cases.json`（`mustContainAny` 等）与各测试中的依赖，列出"改叙事文本会牵动的断言清单"。
4. 全部结论写进 PROGRESS.md 本步骤条目下。

### 1.2 styleBible.ts → profile v3

1. `style_profile_id` 升级为 `youth_adventure_ensemble_v3`。前提：1.1 确认无硬依赖；若有，保持旧 id、内容照升，并记 Deviations。旧值→新值写入 PROGRESS。
2. 按 STYLE_BIBLE 重写各字段：
   - `tone`：§1 的一句话文风定义 v3。
   - `sentence_rhythm` / `dialogue_policy`（20–40%、场景条件、落地要求）/ `pacing_policy`（五档位 + 三回合法则的紧凑表述）/ `ending_policy`（五型钩子 + 禁选项预告）。
   - `imagery_bank`：按楼层/时段分池（至少 B1、1F、3F、7F、夜晚五池，每池 6+ 个具体意象），供轮换。
   - `forbidden_phrases`：并入 §6 扩展清单全量（选项预告句式、陈词滥调、AI 腔词）。
   - `forbidden_registers` / `positive_constraints` / `negative_constraints` 对齐 §6/§7。
3. styleValidator 若引用了被改字段名/结构，做最小适配；相关单测更新；`pnpm test:unit` 过。

### 1.3 playerChatSystemPrompt.ts 三处重写

1. 重写【最高优先级·平台身份】与【叙事风格】两段，落入 §1/§2/§3/§4/§6/§7 的核心条款。**写法要求**：
   - 指令式短句，每条一行，可执行、可判定；不写形容词化的空话。
   - 必须写进 prompt 的（模型侧执行项）：四拍结构、五型钩子 + 禁止选项预告尾巴、对白要求（在场可对话 NPC 时 20–40% + 对白落地）、一段至多一喻、恐怖峰值后给情绪出口、诡异靠事实差异、内心自嘲每回合 ≤2 处。
   - 禁语清单**不**全量塞 prompt：只写高频雷区前 6–8 条，全量清单由 validator 兜底。
   - 体积纪律：stable prompt 有体积测试（"stable prefix 体积已降到可控范围"）。新文风段字符数 ≤ 旧段的 120%；细则装不下的，留给 styleGuide packet 与 phase-2 的节奏指令。
2. **不许动语义的段**（措辞微调允许，删改语义禁止）：承接 7 条、POV 硬约束、JSON 契约段（含「请严格以 JSON 格式输出」字面量）、叙事长度自适应段的机制部分、NPC 规范名册、地图硬约束、认知边界、合规红线。
3. compact 版文风句（`buildCompactStablePlayerDmSystemLines()` 内）同步重写为一句话 v3 版；`buildStyleGuidePacketBlock()` 同步重写（可比 stable 段更细，它是动态块）。
4. bump 版本：`.env.example` 中 `VERSECRAFT_DM_STABLE_PROMPT_VERSION` 给出新值（建议 `v3-<日期>`）；文件头注释如记录版本历史则同步。运行 `node scripts/gen-player-chat-stable-prompt.mjs`（先读脚本确认行为）与 `pnpm prompts:regen:verify`，全部通过。

### 1.4 styleExamples.ts few-shot 更新

1. 重写为 4–6 段新风格典范：直接取材 STYLE_BIBLE §10 的"改后"示例并按 few-shot 注入格式适配，覆盖不同档位（承接/对白幽默/诡异留白/爽点/温情）。
2. 找到 styleExamples 的消费方，核对注入路径与体积预算；确认注入后 prompt 总体积仍过体积测试。

### 1.5 测试/评测锚同步

按 1.1 的清单逐个同步，不许漏：

1. `playerChatSystemPrompt.test.ts`：`toContain` 断言字符串更新为新文风段的关键词（断言语义保持"文风段存在且含关键条款"）。
2. `mockScenarios.ts`：三段叙事（normalNarrative / originiumNarrative / taskCompleteNarrative）按新风格重写——保持原有长度量级、场景语义（走廊试探 / 原石恢复理智 / 任务完成）与被依赖的关键词兼容（1.1 第 3 条清单）；无法兼顾时改断言而不是写坏文案，并记录。`MOCK_ACTION_OPTIONS` 四条按 §11 重写（含一条"歪点子"）。
3. `benchmarks/llm-evals/cases.json`：expect 中依赖旧文本关键词的字段同步。
4. `e2e/fixtures/endingMocks.ts`：内含叙事文本的，风格同步。
5. `promptfooconfig.yaml` 与 `tests/promptfoo/tests/*`、`tests/promptfoo/assertions/schema-validators.ts`：核对断言是否依赖旧措辞。
6. `benchmarks/narrative-style/cases.json`：旧 mock 三段确认在 `must_fail`（phase-0 已放则核对）；新写的三段 mock 叙事加入 `golden_pass`。

### 1.6 评测迭代循环（最少完整两轮）

1. 循环体：`pnpm test:unit` → `pnpm eval:narrative-style:mock` → 起 mock 服务跑 `eval:chat-quality:mock`、`eval:narrative-safety:mock`、`eval:npc-consistency:mock`、`benchmark:chat:mock` → `pnpm test:e2e:mock`。
2. 任何红项：定位 → 修 → 从头重跑。禁止通过放松阈值让评测变绿（阈值改动只允许在 STYLE_BIBLE §12 同步修订并说明理由的前提下进行）。
3. 结果与 phase-0 基线对比，写 `baselines/<日期>-phase-1.md`：新旧遥测对照（句长 spread、感官密度、dialogueRatio、simileCount、hookType 分布应全面改善）。

### 1.7 （可选，需用户配合）live 验证

用户提供网关环境时：`pnpm verify:ai-gateway` → 真实跑 5–10 回合并导出叙事 → `pnpm eval:narrative-style -- --mode live --input <导出文件>` 记录 judge 分（目标总分 ≥3.0/4，任一维 ≥2.5）。同时在汇报中提醒：**部署环境需更新 `VERSECRAFT_DM_STABLE_PROMPT_VERSION`**。

---

## 3. 硬性禁止

- 「请严格以 JSON 格式输出」字面量、DM JSON 字段清单、POV 第一人称硬约束、承接 7 条机制语义、NPC 名册段、地图硬约束段、认知边界段：**不动语义**。
- 不改 maxTokens tier 数值、`narrativeBudgetPackets.ts`、`taskPolicy.ts` 的任何策略值。
- prompt 与代码中不得出现参考作品专名（STYLE_BIBLE §9 红线）。
- 不为让评测变绿而放松 phase-0 建立的判据。

---

## 4. 验收清单

- ✅ `pnpm test:unit`、`npx eslint .`、`pnpm exec tsc --noEmit`
- ✅ `pnpm prompts:regen:verify`；stable prompt 体积测试通过
- ✅ `pnpm eval:narrative-style:mock` gatePass
- ✅ `eval:chat-quality:mock` / `eval:narrative-safety:mock` / `eval:npc-consistency:mock` 全过，阈值未放松
- ✅ `pnpm benchmark:chat:mock` 通过（延迟零回归）
- ✅ `pnpm test:e2e:mock` 通过
- ✅ `baselines/` phase-1 文件 + PROGRESS 更新，NEXT 指向 phase-2

## 5. 汇报

按 CLAUDE.md §15。额外必须包含：四处文风源的改动摘要、`style_profile_id` 新旧值、`VERSECRAFT_DM_STABLE_PROMPT_VERSION` 新值与部署提醒、评测迭代轮数与每轮关键分数变化。
