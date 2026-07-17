# Phase 0：评测先行 —— 建立文风度量与基线

> **目标**：在不改变任何叙事行为的前提下，为仓库装上一把能持续度量文风的尺子。之后所有阶段的改动都用这把尺子验收；这也是"以后不管怎么改都不会把文风改崩"的护栏地基。
> **前置**：无。**预计**：1–2 个会话。
> **本阶段零行为变化**：不改 prompt、不改 mock 叙事文本、不加任何拦截。只加"测量"。

---

## 0. 开始前必读

- `docs/narrative-refactor/STYLE_BIBLE.md` §12（判据映射表——本阶段的需求清单）与 §10（语料素材）
- `src/lib/narrativeStyle/styleValidator.ts` + `styleValidator.test.ts`（判据已有一半，本阶段是扩展它，不是重写它）
- `src/lib/narrativeStyle/styleBible.ts`
- `scripts/eval-npc-consistency.ts`（**离线纯函数评测蓝本**——本阶段主要模仿它：不起服务、不打 HTTP）
- `scripts/eval-chat-quality.ts` + `src/lib/evals/chatQualityRubric.ts` + `benchmarks/llm-evals/cases.json`（脚本 CLI 风格与汇总结构蓝本）
- `src/lib/evals/narrativeSafetyRubric.test.ts`（rubric 单测写法模板：`baseCase()` 工厂 + node:test + assert/strict）
- `src/lib/evals/judge/judgeExecutor.ts` + `src/lib/evals/liveProvider.ts`（LLM judge 蓝本）
- `.github/workflows/ci.yml` 的 `mock-chat-guardrails` job

如果上述任一文件不存在或结构与描述不符：停下，grep 确认真实位置，把差异记入 PROGRESS.md 的 Deviations，再继续。**不要按记忆造相似物。**

---

## 1. 目标与非目标

**目标**：① styleValidator 新增遥测型判据；② 离线文风评测（rubric + 语料 + 脚本 + npm script）；③ live judge 模式；④ CI report-only 接线；⑤ 基线入库。

**非目标**：不改 `playerChatSystemPrompt.ts`；不改 `mockScenarios.ts` 的叙事文本；不改 `styleBible.ts` 既有字段的值（新增字段允许）；新判据一律不触发 `narrativeOverride` / `optionsOverride` / commit 拦截；不动 `/api/chat` 路径上的任何代码。

---

## 2. 执行步骤

### 0.1 现状核对（不改代码）

逐行对照 STYLE_BIBLE §12 表中标注"已有"的判据，确认真实的函数名、issue code、severity、阈值与 telemetry 字段名；确认 `validateNarrativeStyle` 的输入输出形状与调用方（`validateNarrative.ts` 的桥接方式）。产出一份核对笔记（判据名 → 文件:行为 → 与 §12 的出入）写进 PROGRESS.md；有出入的行同时修正 STYLE_BIBLE §12（这是允许的：宪法的机器映射列必须反映代码事实）。

### 0.2 离线文风评测核心

1. 新建 `src/lib/evals/narrativeStyleRubric.ts`：
   - 类型 `NarrativeStyleEvalCase`：`{ id; kind: "golden_pass" | "must_fail"; text; sceneContext?: { talkableNpcPresent?: boolean; turnMode?: string; expectedRegister?: string }; expect?: { mustHitIssues?: string[]; mustNotHitIssues?: string[] } }`。
   - `evaluateNarrativeStyleCase()`：内部调用现有 `validateNarrativeStyle()`（加上 0.3 的新判据），折算 pass 维度。
   - `summarizeNarrativeStyleEval()` 产 `gatePass`。**gate 规则**：`golden_pass` 用例不得命中任何 hard 级 issue；`must_fail` 用例必须命中其 `mustHitIssues` 标注的 issue。后者是**反向保护**——如果未来有人把校验器改弱，must_fail 用例会开始"通过"，评测立刻变红。这是防"文风判据被悄悄删弱"的关键机制。
2. 新建语料 `benchmarks/narrative-style/cases.json`：
   - `golden_pass` 12–20 段：直接取 STYLE_BIBLE §10 的全部"改后"示例，再自写补充，覆盖五档位 × 主要场景（探索/对话/战斗后/温情/爽点/micro 短回合）。自写段落必须逐条对照 §3/§4/§6 自检后才可入库。
   - `must_fail` 10–15 段：§10 的现状样本（mock 三段原文）+ 人工构造的典型病文，每段标注 `mustHitIssues`：三连喻段、选项预告尾巴段、零对白解释腔段、AI 腔段、守则腔段、意象堆叠段、感官贫瘠流水账段。
3. 单测 `src/lib/evals/narrativeStyleRubric.test.ts`，按 `narrativeSafetyRubric.test.ts` 模板写。

### 0.3 styleValidator 新遥测（只测量，不拦截）

在 `src/lib/narrativeStyle/styleValidator.ts` 中新增（全部走既有 issue/telemetry 模式，severity 本阶段一律定为最低档，phase-6 才升级）：

1. `choice_preview_tail`：结尾段命中选项预告句式（"我能…也能…"、"…，或者…"收尾、"是…还是…？"自问收尾）。
2. `simile_chain`：单段内"像/仿佛/如同/好似/宛如"计数 ≥3；telemetry 增加 `simileCount`。
3. hookTaxonomy：对结尾两段做五型钩子启发式分类（关键词 + 句式），telemetry 增加 `hookType: "question"|"threat"|"dilemma"|"bond"|"reveal"|"none"`；既有 `hook_missing` 逻辑不动。
4. `dialogueRatio` telemetry：引号内字符占比。注意中文引号「」与“”的处理——先看 `splitSentences` 等既有工具怎么处理引号，复用其约定。
5. 新建 `src/lib/narrativeStyle/registerClassifier.ts`：纯函数，输入 narrative 文本（可选结构化字段辅助），输出 `{ register, confidence }`（五档位见 STYLE_BIBLE §2）。关键词/特征启发式即可，不确定时归 `suspense`。分类器不必完美，**趋势可用即达标**。附单测。

完成后：`pnpm test:unit` 全绿；本地按 ci.yml 方式起 mock 服务跑现有三个 mock eval，确认结果与改前完全一致（零行为变化的证据）。

### 0.4 评测脚本与 npm scripts

1. 新建 `scripts/eval-narrative-style.ts`，仿 `eval-npc-consistency.ts`：**默认离线纯函数模式**（读 `benchmarks/narrative-style/cases.json` → 逐例 evaluate → 汇总打印）；`--assert` 时 `gatePass=false` 则 `process.exitCode=1`；`--json-out` 写报告。CLI 参数与输出风格与现有 eval 脚本保持一致。
2. `package.json` 新增：
   - `"eval:narrative-style": "tsx scripts/eval-narrative-style.ts"`
   - `"eval:narrative-style:mock": "tsx scripts/eval-narrative-style.ts --mode mock --assert --json-out .runtime-data/eval-narrative-style-mock.json"`

### 0.5 live judge 模式

1. `eval-narrative-style.ts` 增加 `--mode live`：复用 `src/lib/evals/judge/judgeExecutor.ts` 的多裁判中位数基建（先读清它的输入约定与接入方式，按现状接，**不自创网关旁路**；judge 调用不得经过 PLAYER_CHAT 任务）。
2. 评分维度：STYLE_BIBLE §12 末行的 8 维（承接性/画面感/节奏变化/钩子力度/人物声音/情绪配比/中文流畅无AI腔/选项质量），每维 0–4 分。judge prompt 中的 rubric 文本直接内联为常量，注明"源自 STYLE_BIBLE v3.0"，各维评分标准从对应章节提炼 2–3 句判词。
3. 输入：支持 `--input <file>` 读取真实回合导出的叙事文本集（JSON 数组）；报告显著标注 judge 模型与温度。live 模式不进 CI 常规路径。

### 0.6 CI 接线（report-only）

`.github/workflows/ci.yml` 的 `mock-chat-guardrails` job：

1. eval 序列末尾追加 `pnpm run eval:narrative-style:mock || true`，加注释 `# narrative-refactor phase-6 翻硬门`。
2. upload-artifact 的 path 列表增加 `.runtime-data/eval-narrative-style-mock.json`。
3. **不**新增硬门 job（那是 phase-6 的事）。

### 0.7 基线采集

1. 本地依次跑并记录：`pnpm test:unit`；`pnpm eval:narrative-style:mock`；mock 服务起来后（按 ci.yml 的方式：`AI_PROVIDER=mock pnpm build` + `next start`）跑 `eval:chat-quality:mock`、`eval:narrative-safety:mock`、`eval:npc-consistency:mock`、`benchmark:chat:mock`。本地起服务确有困难时，注明原因，离线项照跑，服务项交 CI 兜底。
2. 对"当前风格代表文本"跑 styleValidator 并聚合遥测：`mockScenarios.ts` 三段、`src/features/play/opening/openingCopy.ts` 的 `FIXED_OPENING_NARRATIVE`、`e2e/fixtures/endingMocks.ts` 中的叙事段。聚合结果（句长/spread/感官密度/uniqueWordRatio/simileCount/dialogueRatio/hookType 分布）写入 `docs/narrative-refactor/baselines/<日期>-phase-0-initial.md`。这份"改前快照"是之后所有对比的原点。
3. PROGRESS.md 基线表登记全部命令与关键数字。

---

## 3. 硬性禁止

- 不改 `playerChatSystemPrompt.ts`、`mockScenarios.ts` 叙事文本、`styleBible.ts` 既有字段值。
- 新判据不得进入任何拦截/改写路径（不碰 `validateNarrative.ts` 的 override 逻辑，不碰 `commitTurn.ts`）。
- 不把 `eval:narrative-style:mock` 设为 CI 硬门。
- 不动 `/api/chat` 与 `src/features/play/**` 的任何运行时代码。

---

## 4. 验收清单

- ✅ `pnpm test:unit` 全绿（含全部新单测）
- ✅ `pnpm eval:narrative-style:mock`：golden_pass 全过、must_fail 全部按标注命中
- ✅ 现有三个 mock eval 结果与改前一致（零行为变化）
- ✅ `pnpm benchmark:chat:mock` 通过（或注明未跑原因）
- ✅ `npx eslint .` 无新告警
- ✅ `baselines/` 有 phase-0 基线文件；PROGRESS.md 已更新，NEXT 指向 phase-1

## 5. 汇报

按 CLAUDE.md §15 格式。额外必须说明：新增判据清单及各自 severity；明确声明"本阶段全部 report-only，线上行为零变化"及其验证证据。
