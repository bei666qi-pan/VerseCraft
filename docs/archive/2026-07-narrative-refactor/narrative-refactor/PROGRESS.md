# 进度账本（narrative-refactor）

> 每次会话结束前必须更新本文件。规则见 README.md §8。

**NEXT：全部完成 ✅**

---

## 阶段状态总览

| 阶段 | 状态 | 开始 | 完成 | 关键提交 |
|---|---|---|---|---|---|
| phase-0 评测先行 | 完成 | 2026-07-08 | 2026-07-08 | styleValidator/registerClassifier/eval scripts/live judge/CI/基线 |
| phase-1 文风源重写 | 完成 | 2026-07-08 | 2026-07-08 | styleBible/prompt/styleExamples/mockScenarios rewrite |
| phase-2 节奏导演 | 完成 | 2026-07-08 | 2026-07-09 | ledger模块 → pacingLedger / directivePackets / styleValidator register_repetition / route.ts 接线
| phase-3 开场重写 | 完成 | 2026-07-09 | 2026-07-09 | v3开场1435字/beat重写/任务链文案/周边对齐/回归修复/基线 |
| phase-4 NPC 声音 | 完成 | 2026-07-09 | 2026-07-09 | voiceCard×6/群像补声/persona注入/幽默位/对白指令/91 case eval pass |
| phase-5 伏笔兑现 | 完成 | 2026-07-09 | 2026-07-09 | foreshadowOps全链路/伏笔状态机/ledger写入读取/taskToast升级/settlement高光/任务三要素/回归全绿 |
| phase-6 回归收口 | 完成 | 2026-07-09 | 2026-07-09 | test:gate 纳入 narrative-safety · CLAUDE.md 增补 · 基线终版 · 交接报告 |

---

## 步骤勾选

### phase-0

- [x] 0.1 通读现有评测与文风判据，产出现状核对笔记
- [x] 0.2 离线文风评测：narrativeStyleRubric + 语料 + 单测
- [x] 0.3 styleValidator 遥测扩展（只加遥测不加拦截）
- [x] 0.4 eval:narrative-style 脚本 + package.json scripts
- [x] 0.5 live judge 模式（eval-narrative-style.ts --mode live + narrative_style_v1.json rubric + 内联 DeepSeek 调用）
- [x] 0.6 CI 接线（eval:narrative-style:mock report-only 追加到 mock-chat-guardrails）
- [x] 0.7 采集基线并入库 baselines/（phase-0-complete 基线文件 + 遥测聚合）

### phase-1

- [x] 1.1 通读四处文风源 + 全部消费方与测试锚
- [x] 1.2 styleBible.ts profile v3 重写
- [x] 1.3 playerChatSystemPrompt.ts 三处文风段重写 + bump 版本
- [x] 1.4 styleExamples.ts 新 few-shot
- [x] 1.5 同步全部测试/评测风格锚
- [x] 1.6 评测迭代循环（≥2 轮）全绿并对比基线
- [ ] 1.7 （可选）live 评测记录
- [x] 验证阶段：修复 NPC 名册漂移（N-044/N-045 缺失）

### phase-2

- [x] 2.1 核查节奏底座现状（validatePacing 接线情况、directorState 读写路径）
- [x] 2.2 新表 migration（narrative_pacing_ledger / narrative_foreshadow_ledger）✅ 2026-07-09 通过 psql 直接建表完成
- [x] 2.3 回合情绪档位分类落库（final hooks 内非阻塞）
- [x] 2.4 每回合节奏指令 packet（确定性构建 + 灰度开关）
- [x] 2.5 结尾钩子强制 + 定向尾段改写通道
- [x] 2.6 情绪配比软守卫
- [x] 2.7 节奏类评测用例 + 全套回归

### phase-3

- [x] 3.1 通读开场链路
- [x] 3.2 重写固定开场正文（多候选择优）— v3 终版 1435 字
- [x] 3.3 重写 OPENING_SYSTEM_PROMPT — 四方向差异化选项
- [x] 3.4 前五回合 beat + 开局任务链文案 — 5 任务文案重写
- [x] 3.5 周边文案对齐（intro/引导/等待/兜底）
- [x] 3.6 e2e 与多视口回归 — beat 映射修复 + 测试断言更新
- [x] 3.7 评测全套 + 基线更新 — narrative-style 86/86 gatePass

### phase-4

- [x] 4.1 通读 NPC 数据链
- [x] 4.2 六辅锚 voice card 强化 + 群像补声
- [x] 4.3 幽默/反差功能位指定
- [x] 4.4 persona packet 预算核对与注入
- [x] 4.5 对白配额场景化指令
- [x] 4.6 对白 golden 语料 + npc-consistency 回归
- [x] 4.7 评测全套

### phase-5

- [x] 5.1 通读任务/章节/世界引擎钩子链
- [x] 5.2 DM JSON 可选字段 foreshadow_ops 全链路接线
- [x] 5.3 伏笔兑现调度（directive 注入 + 离线 lane 播种）
- [x] 5.4 爽点节拍：任务里程碑 + 章节 endHook + 结算高光
- [x] 5.5 任务文案戏剧化 pass
- [x] 5.6 生命周期单测 + e2e + 评测全套

### phase-6

- [x] 6.1 全量回归 ✅ 2026-07-09 unit 2551/2551 + eslint 0 errors + eval:narrative-style 91/91 + eval:narrative-safety gate=pass（json/sse=0 为 mock 已知）
- [x] 6.2 CI 硬门 narrative-style-mock-gate ✅ 2026-07-09 test-gate.mjs L5 已纳入 eval-narrative-style + eval-narrative-safety（均带 --assert）
- [x] 6.3 test:gate 纳入新评测
- [x] 6.4 CLAUDE.md 增补
- [x] 6.5 基线终版 + drafts 归档
- [x] 6.6 交接报告

---

## 基线与验证记录

> 每次跑评测/基准后追加一行。JSON 报告在 `.runtime-data/`（不入库），关键数字抄录到这里，阶段级快照存 `docs/narrative-refactor/baselines/`。

| 日期 | 阶段/步骤 | 命令 | 关键结果 |
|---|---|---|---|
| 2026-07-08 | phase-0/0.1 | 通读核查完成 | 见下方 Deviations 表 |
| 2026-07-08 | phase-0/0.3 | validateNarrativeStyle telemetry/registerClassifier | 2 new codes (severity=low) + 3 telemetry fields + registerClassifier.ts + 7 tests |
| 2026-07-08 | phase-0/0.4 | eval scripts + npm scripts | 26/26 gate pass · benchmark/judge/narrative_style_v1.json |
| 2026-07-08 | phase-0/0.5 | live judge 模式 | eval-narrative-style.ts --mode live + rubric + DeepSeek |
| 2026-07-08 | phase-0/0.6 | CI 接线 | mock-chat-guardrails 追加 eval:narrative-style:mock report-only |
| 2026-07-08 | phase-0/0.7 | 基线入库 | baseline → docs/narrative-refactor/baselines/2026-07-08-phase-0-complete.md |
| 2026-07-08 | phase-1/1.6 | 首次全绿 | 2445/2445 unit · 26/26 gate pass · baseline → docs/narrative-refactor/baselines/2026-07-08-phase-1.md
| 2026-07-08 | phase-1/验证 | 修复 NPC 名册漂移后重新验证 | prompts:regen:verify pass · eval:narrative-style:mock 26/26 gate=pass · eval:narrative-safety:mock gate=pass · 2445/2445 unit · eslint 0 errors · benchmark:chat:mock 需服务器环境<br>⚠️ tsc --noEmit: pre-existing 19 type errors（worldKnowledge retrieval/routes/middleware 等，非 phase-1 引起）
| 2026-07-09 | phase-2/2.3-2.6 | ledger/directive/hook/guard 实现 | pacingLedger.ts 14 tests+2 suites · directivePackets.ts · styleValidator register_repetition code · route.ts finalHooks 接线 · ESLint 0 new errors on changed files · 2519/2519 unit pass（+74 from baseline）<br>⚠️ 2.3 leder write: 需人工 db:push 后生效（表可能尚不存在）<br>⚠️ 2.4 directive: 灰度关 `VERSECRAFT_ENABLE_NARRATIVE_DIRECTIVE=false`（需人工确认后开）<br>⚠️ 2.7 节奏类评测: 已覆盖 register_repetition 检测（styleValidator）+ pacing 10 老用例+ledger 14 新用例+styleValidator 9 用例；benchmark 需人工环境运行
| 2026-07-09 | phase-5/5.3 | 伏笔兑现调度 | foreshadowLedger.ts 写入/读取/过期 3 函数 · turnEnvelope foreshadow_ops 字段 · route.ts directive 注入 readDueForeshadowEntries · route.ts final hooks insertForeshadowLedgerRows + expireOverdueForeshadows · foreshadowLifecycle.ts markExpired 签名修正 · 2551/2551 unit pass · ESLint 0 errors<br>⚠️ DB 依赖: narrative_foreshadow_ledger 表需 db:push 后写入/读取才生效（fail-open 降级）<br>⚠️ dueForeshadow DB read: 需 db:push 后 directive 中才会出现伏笔提示 |
| 2026-07-09 | phase-5/5.4 | 爽点节拍 | deriveCompletedTaskToast §5 语气升级（"——收。"/"——落空了。"）· EndingSettlementSnapshot.highlights 可选字段 · settlement page "本局高光时刻"分节 + writingMarkdown 导出 · ESLint 0 errors · 2551/2551 unit pass<br>⚠️ highlights 数据: 需 db:push 后从 narrative_pacing_ledger 查询 is_payoff/hookType=reveal 回合填充 |
| 2026-07-09 | phase-5/5.5 | 任务文案戏剧化 | playerChatSystemPrompt 任务三要素强制约束（title=具体动作/desc=代价入手/nextHint=可执行第一步）· 好坏例已有无需改动 · VERSECRAFT_DM_STABLE_PROMPT_VERSION 需人工 bump · ESLint 0 errors · 2551/2551 unit pass |
| 2026-07-09 | 运营落地 | db:push + env vars | ✅ narrative_pacing_ledger + narrative_foreshadow_ledger 通过 psql 直接建表（含 3 个索引）· VERSECRAFT_DM_STABLE_PROMPT_VERSION="v5-20260709" · VERSECRAFT_ENABLE_NARRATIVE_DIRECTIVE="1" · .env.example 已同步文档 |

---

## 2.1 核查结果

### validatePacing 接线状态
- **已接线**：route.ts L3887 在 `runStreamFinalHooks` 中调用 `validatePacing()`（条件：`narrativeSafetyRuntime.pacingValidatorEnabled` 为 true，默认开）。
- Pacing report 流向：`collectSafetyReport`（L3935）→ `planNarrativeSafetyEnforcement`（L3950）→ `commitTurn`（L4094）。
- `planTurnLaneSideEffects()`（routeTurnLane.ts）已为 RULE/REVEAL lane 设 `requirePacingValidation: true` → 影响 narrativeBudgetBlock 构建。
- **注意**：`pacingHardGateTriggered` 在 runtimeConfig.ts:187 硬编码为 `false`，故 pacing 报告不触发硬阻止。Pacing 当前处于"告警但不阻断"的观察者+修复驱动模式（pacingNeedsRepair → repair 决策是可用的）。
- `validatePacing` 输入中 PacingStateSnapshot 依赖客户端 `directorDigest`（beatModeHint/tension/pressureFlags/stallCount），非 DB 读取。

### directorState 在线读写路径
- **loadDirectorState 未在线接线**：route.ts 使用 `clientState.directorDigest`（客户端投影），不调用 `loadDirectorState()` 读取 DB。
- **saveDirectorState 未在线接线**：仅由后台 world worker 写入 `world_engine_director_state`，route.ts 不调用。
- 当前在线路径的"节奏状态"全部来自客户端回传，DB 状态机由 worker 异步驱动。

### world_engine_* 表会话标识约定
- 所有 world_engine 表使用 `sessionId: varchar("session_id", { length: 191 }).notNull()`。
- 写模式为 fire-and-forget（`scheduleBackgroundWorldTick` L4838 模式：Promise 异步 + catch 吞错）。

### 关键注入点确认
- **动态 suffix 注入点**：route.ts L2158 `buildDynamicPlayerDmSystemSuffix()` — 节奏指令 packet 可新增字段在 `PlayerDmDynamicSuffixInput`。
- **后台 tick 写入点**：route.ts L4838 `scheduleBackgroundWorldTick()` — ledger 写入应仿照此 fire-and-forget 模版。
- **灰度开关模式**：`versecraftRolloutFlags.ts` 使用 `readFlag("VERSECRAFT_ENABLE_...", defaultTrue)` 模式。Phase-2 指令 packet 需默认关。

### 与 phase-2.md 描述差异
1. validatePacing 已有完整接线（非 observer-only），但 PacingStateSnapshot 来自客户端而非 DB。
2. directorState DB 读写在线路径未接线，完全由 worker 驱动。
3. `pacingHardGateTriggered` 硬编码 false，与"软守卫"预期一致。

### 结论
节奏底座的 validator 侧已就绪（2.5/2.6 的尾段改写触发与 soft guard 可依赖现有 report→repair 路径）。但 driver 侧（2.3/2.4 的 ledger 写入与 directive 注入）需要从零搭建：新表、新建写入/读取模块、动态 suffix 注入、灰度开关。

### 四处文风源及其消费方

**① playerChatSystemPrompt.ts**
- `buildStablePlayerDmSystemLines()` (L56-162)：稳定 prompt 全量，含最高优先级·平台身份段 + 叙事风格段 + 承接 7 条 + POV 硬约束 + NPC 初见规则等
- `buildCompactStablePlayerDmSystemLines()` (L199-209)：紧凑版（一行文风句 + JSON 契约 + 安全合规）
- `buildStyleGuidePacketBlock()` (L262-264)：文风质感短块
- 消费方：`getStablePlayerDmSystemPrefix()` → route.ts KV cache 前缀；`getCompactStablePlayerDmSystemPrefix()` → route.ts 紧凑路径
- 测试 toContain 锚（style-specific 6 条）："电影感强的场景调度与命运感"、"长句蓄势、短句断喝"、"生活化动作、位置、正在做的事"、"对白可通俗"、"误闯学生/新来的人/需要判断风险的陌生人"、"禁止突兀站着等主角"
- 体积测试：<10200 chars

**② styleBible.ts** — profile `youth_campus_suspense_v2`
- 消费方：styleValidator.ts（判据源）、styleValidator.test.ts、narrativeStyleRubric.ts（eval）、narrativeStylePackets.ts（prompt 注入）、styleExamples.ts（默认参数）、narrativeGovernanceGoldenScenes.test.ts
- `style_profile_id` 硬依赖：仅作为标识/遥测键，无语义硬依赖；`getVerseCraftStyleProfile()` 始终 return DEFAULT_PROFILE（`void profileId`）→ **安全可改**

**③ styleExamples.ts** — 8 条 few-shot (investigation/dialogue/combat/reveal/low_sanity/item_usage/talent_activation/npc_emotional)
- 消费方：narrativeStylePackets.ts（作为 examples_compact 注入 prompt）、narrativeGovernanceGoldenScenes.test.ts

**④ 测试/评测锚**
- `mockScenarios.ts`：normalNarrative（走廊/灯管/刮擦声）+ originiumNarrative（原石/能量/理智/恢复）+ taskCompleteNarrative（档案/失踪/线索）+ MOCK_ACTION_OPTIONS
- `benchmarks/llm-evals/cases.json`：mustContainAny 含"走廊""原石""能量""理智""档案""失踪""线索"
- `benchmarks/task-eval/scenarios.json`：mustContain 含"碎片""发光""绷带""伤口""原石""能量""档案""失踪""线索""理智""模糊""走廊""电工老刘""武器""手电"
- `benchmarks/narrative-style/cases.json`：phase-0 26 条语料（无关旧措辞）
- `playerChatSystemPrompt.test.ts`：15+ toContain 锁定措辞 + 2 个 !includes（龙族/江南）
- 三方 tests（`playerChatSystemPrompt.ruleSnapshot.test.ts`、`canonNpcRoster.test.ts`、`professionConsistency.test.ts`）：不依赖文风措辞，只测结构

### style_profile_id 更新结论
`youth_campus_suspense_v2` → `youth_adventure_ensemble_v3` 安全可改，需同步：styleBible.ts（4 处）、styleExamples.ts（默认参数）、narrativeStylePackets.ts（buildNarrativeStyleBiblePacketBlock 引用）、styleValidator.ts（DEFAULT_VERSECRAFT_STYLE_PROFILE_ID import）

### mock 文本迁移约束
重写 mockScenarios 三段叙事时须保持关键词兼容：normalNarrative 须含"走廊"；originiumNarrative 须含"原石/能量/理智"；taskCompleteNarrative 须含"档案/失踪/线索"。MOCK_ACTION_OPTIONS 四条按 §11 重新（方向差异化、代价可嗅、一条歪点子）。

---

## Deviations（代码事实与计划不符处）

| 日期 | 计划描述 | 实际代码事实 | 处理 |
|---|---|---|---|
| 2026-07-08 | §12 `sentence_rhythm_flat` 阈值 | §12 写 threshold，styleValidator 实际用 get 条件：`sentenceLengths.length >= 4 && avgLen >= 8 && spread <= 2` | 无差异，条件等价于 threshold，已确认 |
| 2026-07-08 | §12 `dialogueRatio` 列为 styleValidator 判据 | 当前无此判据实现，`collectDialogueSpans` 只有计数 telemetry | 0.3 步骤需新增 |
| 2026-07-08 | §12 `choice_preview_tail` 列为新增判据 | 当前不存在 | 0.3 步骤需新增 |
| 2026-07-08 | §12 `simile_chain` 列为新增判据 | 当前不存在（PURPLE_RE 检测"仿佛/像是/如同/宛如"等词但无连喻检测） | 0.3 步骤需新增 |
| 2026-07-08 | §12 `hookTaxonomy` 列为新增判据 | 当前 `hook_missing` 只检测无钩子，无钩子分类 | 0.3 步骤需新增 |
| 2026-07-08 | §12 `hook_missing` 为 hard 级、≥95% | 当前实现：severity "medium"，条件在 `turnMode === "narrative_only"` 时触发 | 无差异，阶段 0 不改 severity |
| 2026-07-08 | §12 表中 `info_density_low` 阈值 uniqueWordRatio ≥0.55 | 代码阈值：`contentWords.length >= 40 && uniqueRatio < 0.55`（触发方向与 §12 一致） | 已确认一致 |
| 2026-07-08 | STYLE_BIBLE §10 样本 B 包含三段 | mockScenarios.ts `normalNarrative` 确为三段拼接，内容准确 | 已确认 |
| 2026-07-08 | `splitSentences` 移除引号 | styleValidator:118 `replace(/[“”"『』「」]/g, "")` 移除中文引号后再分割 | 记入 registerClassifier 设计：中文引号字符已清洗 |
| 2026-07-08 | judgeExecutor 评分维度 1-5（§12 写 0-4） | `NarrativeStyleStyleProfile` 不存在；现场核查 `judgeExecutor.ts` 评分维度是 1-5 而非 STYLE_BIBLE §12 说的 0-4 | §12 末行 8 维评分需修正为 1-5，或 live judge 自行映射 |
| 2026-07-08 | phase-0 要求读 liveProvider.ts | 文件存在已验证 | 已确认
| 2026-07-08 | PROGRESS 声明 phase-1 N-043 为终 | 代码 NPCS 表已扩至 N-045（廖暗+苏弥），prompt 中 NPC 名册缺 N-044/N-045 | 已修复：prompt 名册追加「廖暗N-044, 苏弥N-045」；prompts:regen:verify 通过，45 NPC names verified |

## 0.1 核对笔记：判据名 → 文件:行为 → 与 §12 的出入

### 已有判据（全部在 styleValidator.ts）

| §12 映射 | 位置 | 行为 | 与 §12 出入 |
|---|---|---|---|
| `forbidden_phrase_hit` | code 字符串查找 `styleProfile.forbidden_phrases` | 命中任一 forbidden_phrase 即报；最多报 4 条 | ✅ 一致，hard 级 |
| `mechanical_exposition` | `MECHANICAL_RE` / `MECHANICAL_ZH_RE` 正则 | 命中任一系统播报正则即报 | ✅ 一致，medium→hard |
| `style_drift` | `STYLE_DRIFT_RE` / `RULE_CREEPYPASTA_RE` | 非 verseCraft register 检测 | ✅ 一致 |
| `sentence_rhythm_flat` | `splitSentences` → `sentenceLengthSpread`, 条件 `len>=4 && avgLen>=8 && spread<=2` | spread >2 为通过，≤2 为 flat | ✅ 一致 |
| `dialogue_over_explains` | 对话 2 字 + `EXPLAIN_TERMS_RE` `≥3` | 对白含有解释性词过多 | ✅ 一致 |
| `hook_missing` | `CLOSED_ENDING_RE` + `HOOK_RE` 尾部 36 字检测 | `turnMode === "narrative_only"` 时触发 | ✅ 一致，severity medium |
| `purple_prose_overload` | `PURPLE_RE` 计数，`Math.ceil(len*1.4/100)` | 长度密度判定 | ✅ 一致 |
| `sensory_density_low` | `SENSORY_WORDS` 正则密度 < 2.5/100 字 | 只有 severity low 遥测 | ✅ 一致 |
| `rhythm_variation_flat` | long(≥30)/short(≤8) 句对比 | 无短句/无长句时触发 | ✅ 一致 |
| `dialogue_ungrounded` | 对话后 60 字内是否有动作/环境词 | `< 100%` 落地即触发 | ✅ 一致 |
| `info_density_low` | uniqueWordRatio < 0.55（≥2 字词） | severity low 遥测 | ✅ 一致 |

### 需要新增的判据（0.3 步骤实现）

| §12 映射 | 说明 | 代码位置 |
|---|---|---|
| `choice_preview_tail` | 选项预告尾巴检测：`"我能…也能…"`、`"…、或者…"` | styleValidator.ts |
| `simile_chain` | 连喻检测：像/仿佛/如同/好似/宛如 单段 ≥3 | styleValidator.ts |
| `hookTaxonomy` | 结尾段钩子分类：question/threat/dilemma/bond/reveal/none | styleValidator.ts telemetry |
| `dialogueRatio` | 中文引号「」「」“”字符占比遥测 | styleValidator.ts telemetry |
| `registerClassifier` | 情绪档位分类器：suspense/wit/levity/warmth/payoff | 新建 registerClassifier.ts |

### 桥接方式

`validateNarrative.ts:629-656`：
- 条件调用 `validateNarrativeStyle()` 获取 styleReport
- 输出映射：`mechanical_exposition` / `style_drift` → `NarrativeValidationIssueCode`
- 其他 code (`purple_prose_overload`/`sensory_density_low`/等) → 桥接到 `narrative_style_bridge`
- severity 重映射：只有 `mechanical_exposition`/`forbidden_phrase_hit`/`dialogue_over_explains`/`hook_missing` 升为 medium
- 新判据（0.3 步骤）不触及 validateNarrative.ts 的桥接或 override 逻辑

### 已有评测蓝本（evaluateNarrativeSafetyCase 模板）

- 位置：`src/lib/evals/narrativeSafetyRubric.ts`
- 模式：`baseCase()` 工厂 → `evaluateNarrativeSafetyCase()` → `summarizeNarrativeSafetyEval()`
- 脚本模式：`scripts/eval-narrative-safety.ts` + `package.json` scripts
- 0.2 步骤将模仿此结构写 `narrativeStyleRubric.ts`

### styleValidator 输入输出形状

- 输入：`{ narrative, styleProfile?, focus?, turnMode? }`
- 输出：`{ ok, issues[], telemetry }` — `ok` 在 `issues.length === 0` 时为 true
- 现有调用方：`validateNarrative.ts:632-639`
- 参数携带路径：`route.ts` 组装 `narrativeStyleFocus` → `ValidateNarrativeArgs` → `validateNarrative()` → 内联 `validateNarrativeStyle()`

---

## 决策记录

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-07-08 | 主基调=悬疑冒险+广受众多情绪配比；延迟预算严守；DB 允许增删；交付=分阶段提示词包 | 用户拍板 |
| 2026-07-08 | phase-0 0.1 步骤确认 judgeExecutor 维度为 1-5 分，§12 末行需修正（0-4 → 1-5） | 代码事实 |
