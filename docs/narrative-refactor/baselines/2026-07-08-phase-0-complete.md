# Narrative Refactor Baseline · Phase-0 Complete

> 采集日期：2026-07-08
> 阶段：0.7 基线采集（phase-0 收口）
> 本阶段全部 report-only，线上行为零变化。

## 验证结果

| 验证项 | 结果 | 备注 |
|---|---|---|
| `pnpm test:unit` | 2445/2445 pass | 全绿 |
| `npx eslint .` | 0 errors, 73 warnings | warnings 为仓库基线（未新增） |
| `pnpm eval:narrative-style:mock` | 26/26 gatePass | 17/17 golden_pass + 9/9 must_fail |
| `pnpm exec tsc --noEmit` | 2 pre-existing errors | 非本次改动引入 |

## Phase-0 新增文件

| 文件 | 说明 |
|---|---|
| `src/lib/narrativeStyle/registerClassifier.ts` | 情绪档位分类器（suspense/wit/levity/warmth/payoff） |
| `src/lib/narrativeStyle/registerClassifier.test.ts` | 分类器 7 单测 |
| `scripts/eval-narrative-style.ts` | 离线文风评测 + live LLM-judge 模式 |
| `benchmarks/judge/rubrics/narrative_style_v1.json` | 8 维叙事风格 LLM judge rubric（源自 STYLE_BIBLE v3.0） |
| `docs/narrative-refactor/baselines/2026-07-08-phase-0-complete.md` | 本文件 |

## Phase-0 新增判据（全部 severity low，仅遥测不入拦截）

| 判据 | code | 文件 |
|---|---|---|
| 选项预告尾巴检测 | `choice_preview_tail` | styleValidator.ts |
| 连喻检测（单段 ≥3） | `simile_chain` | styleValidator.ts |
| hookTaxonomy 结尾分类 | hookType telemetry | styleValidator.ts |
| dialogueRatio 对白比遥测 | dialogueCharRatio telemetry | styleValidator.ts |

## Phase-0 新增 npm scripts

| script | 命令 |
|---|---|
| `eval:narrative-style` | `tsx scripts/eval-narrative-style.ts` |
| `eval:narrative-style:mock` | `tsx scripts/eval-narrative-style.ts --mode mock --assert --json-out .runtime-data/eval-narrative-style-mock.json` |
| `eval:narrative-style:live` | `tsx scripts/eval:narrative-style.ts --mode live --assert --json-out .runtime-data/eval-narrative-style-live.json` |

## CI 变更

`.github/workflows/ci.yml` `mock-chat-guardrails` job：
- eval 序列末尾追加 `pnpm run eval:narrative-style:mock || true`（注释 `# narrative-refactor phase-6 翻硬门`）
- upload-artifact 增加 `.runtime-data/eval-narrative-style-mock.json`

## 当前风格遥测（styleValidator 聚合，phase-0 改前快照）

对 5 段代表性叙事跑 `validateNarrativeStyle` 的结果：

| 指标 | openingCopy.ts | endingMocks.ts | normalNarrative | originiumNarrative | taskCompleteNarrative |
|---|---|---|---|---|---|
| 字符数 | 2026 | 39 | 224 | 145 | 154 |
| sentenceCount | 79 | 2 | 9 | 6 | 5 |
| sentenceLengthSpread | 74 | 17 | 34 | 20 | 29 |
| 感官词数 | 74 | 2 | 5 | 2 | 0 |
| uniqueWordRatio | 0.995 | 1.000 | 1.000 | 1.000 | 1.000 |
| simileCount | 29 | 1 | 2 | 1 | 0 |
| hookType | reveal | none | bond | none | reveal |
| dialogueCharRatio | 0.003 | 0 | 0 | 0 | 0 |
| longSentenceCount | 25 | 0 | 4 | 1 | 3 |
| shortSentenceCount | 15 | 0 | 1 | 0 | 0 |
| 触发的 issue codes | simile_chain | (none) | sensory_density_low | sensory_density_low | sensory_density_low |

说明：
- **FIXED_OPENING_NARRATIVE**（2026 字）是长定场叙事，意象丰富（29 个 simile）但超出单段连喻上限 3 → 触发 `simile_chain`。这是 opening 原文的固有风格，phase-3 开场重写时再优化。
- **endingMocks.ts** 只有 1 短句，39 字，不足以触发任何阈值，遥测正常。
- **mock 三段叙事**（phase-1 已重写）各有方向：normal 偏 suspense，taskComplete 有 reveal hook，but all 偏短触发 `sensory_density_low`。
- 所有三段 mock 的对白比（dialogueCharRatio）为 0，是 mock 叙事的固有特征（mock 不模拟真实玩家回合），不影响线上体验。

## 下一阶段

NEXT → phase-2（节奏导演），或待命。
