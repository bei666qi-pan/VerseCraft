## 1. 假通过测试清理

- [ ] 1.1 修复 `foreshadowLedger.test.ts:60` — 将 fire-and-forget `insertForeshadowLedgerRows` + `assert.ok(true)` 改为 `await` + 验证 DB 不可用时返回空数组（不抛异常）
- [ ] 1.2 修复 `foreshadowLedger.test.ts:84` — 将 fire-and-forget `expireOverdueForeshadows` + `assert.ok(true)` 改为 `await` + 验证结果不抛异常
- [ ] 1.3 修复 `runLogger.test.ts:80` — 将 `assert.ok(true)` 替为验证吞错后不写入日志、不修改外部状态（而非仅验证不抛异常）
- [ ] 1.4 删除 `profession-rules.test.ts:67` 存根测试 — `assert.ok(true)` + "实际场景由 prompt 控制"注释的测试用例
- [ ] 1.5 处理 `online-status.spec.ts:117` 永久 skip — 确认后台功能状态后删除测试或改为条件 skip
- [ ] 1.6 处理 `codex-browser-playthrough.spec.ts:18` 永久 skip — 删除冗余 skip 测试或改为条件 skip
- [ ] 1.7 验证：运行 `pnpm test:unit` 确认无新增失败

## 2. Mock 关键词注入切断

- [ ] 2.1 删除 `mockScenarios.ts` 中 `buildKeywordAppendSentence` 函数
- [ ] 2.2 删除 `mockScenarios.ts` 中 `chooseNarrative` 对 `（相关关键词：` 前缀的检测和关键词追加逻辑
- [ ] 2.3 删除 `eval-chat-quality.ts:56-58` 中拼接 `（相关关键词：...）` 前缀到用户输入的代码
- [ ] 2.4 验证：运行 mock mode eval 确认已无关键词注入行为

## 3. 离线评分器默认分修正

- [ ] 3.1 修改 `judgeExecutor.ts` `evaluateOffline` — 未触发已知缺陷的维度默认分从 3 降为 2，verdict 显式设置 `confidence: "offline_heuristic"`
- [ ] 3.2 修改 `judgeExecutor.ts` `parseJudgeJsonOutput` — 缺失维度的默认值从 3 降为 2
- [ ] 3.3 修改 `judgeExecutor.ts` `computeWeightedAverage` — 缺失分数的默认值从 3 降为 2，零权重默认值从 3 降为 2
- [ ] 3.4 修改 `JudgeService.ts` — AI 失败/异常/预算耗尽回退到 `evaluateOffline` 时，确认 verdict 携带 `evidence: "offline_fallback"` 或 `confidence: "offline_heuristic"`
- [ ] 3.5 验证：运行 `pnpm test:unit` 确认 judge executor 相关测试通过

## 4. Benchmark 回退修正

- [ ] 4.1 修改 `benchmark-run.mjs:162` — 安全测试 fallback 从 `{ passRate: 1, total: 28, pass: 28 }` 改为不设默认值，子测试不可用时输出 `not_run`
- [ ] 4.2 修改 `benchmark-run.mjs:98-99` — narrative quality 回退默认从 `judgePass.pass \|\| 32` 等改为子测试不可用时排除该项
- [ ] 4.3 验证：确认 benchmark 脚本语法正确，模拟子测试失败场景验证不回退到满分

## 5. Mock 试玩测试去自洽化

- [ ] 5.1 修改 `sutAdapter.ts` `buildMockSutResponseV2` — 注入至少一个可触发不变量检查的异常场景（如非法位置跳转、空 options + is_action_legal: true）
- [ ] 5.2 修改 `playthrough.test.ts:328` — 移除"mock 模式不应该有不变量违规"断言，改为验证不变量检查器确实运行且产生合理的通过/失败计数
- [ ] 5.3 修改 `narrativeJudge.ts` `judgeNarrativeConsistencyMock` — 基于实际 mock 叙事内容做最小启发式评分，不自动给 5/5
- [ ] 5.4 验证：运行 `pnpm test:unit` 确认 playthrough 测试通过（含新的不变量检查场景）

## 6. 其他阈值和配置修正

- [ ] 6.1 修改 `test_narrative_metrics.py:109` — `immersion` hardFloor 从 0 改为 1
- [ ] 6.2 修改 `game-mechanics/runner.ts:390` — 通过阈值从 0.7 提升至 0.80
- [ ] 6.3 修改 `narrative_quality_v2.json:68` — `canon_consistency` hardFloor 从 1 提升到 2
- [ ] 6.4 验证：检查 Python 语法正确，确认 runner.ts 和 JSON 配置格式有效

## 7. 叙事验证器 low-signal 审计

- [ ] 7.1 修改 `validateNarrative.ts` `extractFactKeywords` — 对 low-signal 事实（不含 `HIGH_SIGNAL_FACT_KEYWORD_RE`）不直接返回空数组，改为返回 `dmOnlyFactsPresent: true` 标记，拦截行为不变（`leakedFactCount` 仍为 0）
- [ ] 7.2 更新 `validateNarrative.ts` 调用方（如 `validateNarrative` 主函数）在收到 `dmOnlyFactsPresent: true` 时记录 telemetry flag，不改变 narrative 输出
- [ ] 7.3 更新 `validateNarrative.test.ts` 中 `"ignores low-signal scene overlap"` 测试，验证返回值包含 `dmOnlyFactsPresent: true` 而非空结果
- [ ] 7.4 验证：运行 `pnpm test:unit` 确认 validateNarrative 测试通过

## 8. 最终验证

- [ ] 8.1 运行 `npx eslint .` 确认无 lint 错误
- [ ] 8.2 运行 `pnpm test:unit` 确认全部单元测试通过
- [ ] 8.3 运行 `pnpm test:gate:quick` 确认快速门禁通过
- [ ] 8.4 运行 `pnpm build` 确认构建成功
- [ ] 8.5 检查 `git diff --stat` 确认改动文件与 proposal 范围一致，无意外扩散
