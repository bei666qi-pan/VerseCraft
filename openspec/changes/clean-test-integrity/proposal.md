## Why

测试体系当前存在三类结构性问题：无实际断言的哑弹测试（`assert.ok(true)` + fire-and-forget）永远通过、mock eval 闭环灌水（关键词注入、离线评分默认及格）制造假高分假象、叙事验证器存在 low-signal 放行缝隙使 DM-only 事实可用平凡语言绕过。这些问题侵蚀了测试结果与 CI 信号的可信度，使 mock 模式下的 eval 分数无法区分“真正通过”与“机制保证通过”。

## What Changes

### 类别1：假通过测试清理
- `foreshadowLedger.test.ts` 2 处 `assert.ok(true)` 替换为真实异步断言，验证 DB 不可用时返回空数组、插入不抛异常且结果可观测
- `runLogger.test.ts` 吞错测试改为验证吞错后不产生副作用（如不写入日志、不修改状态），而非仅验证不抛异常
- `profession-rules.test.ts` 存根测试（`assert.ok(true)` + "实际场景由 prompt 控制"注释）删除，该测试不验证任何可观测行为
- `e2e/online-status.spec.ts:117` 永久 `test.skip(true)` — 若功能已废弃则删除测试文件；若待修复则改为条件 skip
- `e2e/codex-browser-playthrough.spec.ts:18` 同上处理

### 类别2：Mock 闭环灌水切断
- `mockScenarios.ts` 删除 `buildKeywordAppendSentence` 函数及 `（相关关键词：` 检测逻辑，mock 叙事不再根据 eval 关键词注入内容
- `eval-chat-quality.ts` 删除从 eval 用例提取 `mustContainAny` 关键词注入用户输入的代码
- `judgeExecutor.ts` `evaluateOffline` 默认维度分从 3 降为 2（仅未触发已知缺陷时），并显式设置 `confidence: "offline_heuristic"`
- `judgeExecutor.ts` `parseJudgeJsonOutput` 及 `computeWeightedAverage` 缺失维度的默认值从 3 降为 2
- `JudgeService.ts` AI 失败/异常/预算耗尽回退到 `evaluateOffline` 时，在 verdict 中显式标记 `evidence: "offline_fallback"`（已有字段，确认使用）
- `benchmark-run.mjs` 安全测试不可用时 fallback 从 `passRate: 1` 改为 `passRate: 0`，或直接报错不设默认值
- `sutAdapter.ts` Mock SUT 不产生完美状态 — 注入至少一个可触发不变量检查的场景（如非法位置跳转）
- `playthrough.test.ts` 移除“mock 模式不应该有不变量违规”的断言，改为验证不变量检查器确实在 mock 模式下运行且产生合理的通过/失败计数
- `narrativeJudge.ts` mock 裁判不自动给 5/5，基于实际 mock 叙事内容做最小启发式评分
- `test_narrative_metrics.py` `immersion` hardFloor 从 0 改为 1（与 score range 1-5 对齐）
- `game-mechanics/runner.ts` 通过阈值从 0.7 提升至 0.80（与 suite.json 中 task_eval 阈值对齐）

### 类别3：机械降级叙事验证缝隙修补
- `validateNarrative.ts` `extractFactKeywords` 对 low-signal 事实（不含 `HIGH_SIGNAL_FACT_KEYWORD_RE` 的内容）不直接返回空数组，改为返回包含 `dmOnlyFactsPresent: true` 的 low-signal 标记，由上层决定是否记录 telemetry flag，不改变现有拦截行为
- `narrative_quality_v2.json` `canon_consistency` 的 `hardFloor` 从 1 提升到 2，使 score=2（明显冲突）也能触发硬失败

**非目标：** 不修改 `/api/chat` 主链路、不调整 SSE/DM JSON 契约、不改变生产代码叙事行为、不新增 AI 调用、不修改 CI 流水线结构。

## Capabilities

### New Capabilities
- `test-integrity-gate`: 测试断言必须可验证（禁止 `assert.ok(true)` 存根）、mock eval 结果必须显式标注置信度来源（`live_model` / `offline_heuristic`）、benchmark 聚合不可在子测试失败时静默回退到满分

### Modified Capabilities
<!-- 无现有 spec 的需求变更。model-narrative-review-evals 已要求 evidence provenance，
     本次改动使其实现更贴合既有 spec，不改变 spec 级需求。 -->

## Impact

- **测试文件：** `foreshadowLedger.test.ts`、`runLogger.test.ts`、`profession-rules.test.ts`、`playthrough.test.ts`、`sutAdapter.ts` — 替换或删除无意义断言
- **E2E 测试：** `online-status.spec.ts`、`codex-browser-playthrough.spec.ts` — 删除或修复永久 skip
- **Mock 基础设施：** `mockScenarios.ts` — 删除关键词注入函数
- **Eval 管道：** `eval-chat-quality.ts`、`judgeExecutor.ts`、`JudgeService.ts`、`narrativeJudge.ts`、`benchmark-run.mjs` — 降默认分、标注置信度、切断灌水
- **Rubric 配置：** `narrative_quality_v2.json` — hardFloor 提升
- **验证器：** `validateNarrative.ts` — low-signal telemetry flag
- **Python 测试：** `test_narrative_metrics.py` — hardFloor 修正
- **基准测试：** `game-mechanics/runner.ts` — 阈值提升
- **不涉及：** `/api/chat`、SSE 契约、DM JSON 形状、数据库 schema、analytics 事件名、生产 narrative 行为
