## Context

当前测试体系在 mock 模式下存在闭环自洽：mock provider 将 eval 关键词注入叙事 → eval 检测到关键词 → 高分通过。离线评分器（`evaluateOffline`）默认所有维度 3 分（及格），作为 AI 失败/预算耗尽/模拟模式的静默回退。`benchmark-run.mjs` 在子测试失败时回退到 `passRate: 1`。若干测试文件包含 `assert.ok(true)` 或无等待异步的哑弹测试。叙事验证器对 low-signal 事实无声放行。

改动范围限于测试文件、mock 基础设施、eval 管道、rubric 配置和 1 个验证器函数，不碰 `/api/chat` 主链路。

## Goals / Non-Goals

**Goals:**
- 消除所有无实际断言的哑弹测试
- 切断 mock 关键词注入闭环
- 离线评分器输出保守默认分 + 显式置信度标注
- benchmark 聚合不在子测试失败时假装满分
- 叙事验证器 low-signal 路径可审计

**Non-Goals:**
- 不新增 AI 调用或改变 AI gateway 配置
- 不修改 `/api/chat` SSE 契约、DM JSON 形状、turn resolve 逻辑
- 不改变 mock provider 的核心叙事选择逻辑（仅删除关键词注入）
- 不改变 `evaluateOffline` 的已知缺陷检测规则（仅调整默认分和置信度）
- 不修改 CI 流水线 YAML 结构

## Decisions

### D1: 离线评分默认分从 3 降为 2

**选择：** `evaluateOffline` 对未触发已知缺陷的维度默认分数从 3 降为 2。

**理由：** 3 = 及格，不应是"我不知道"的默认答案。2 更接近"未验证，保守估计"的语义。同时 verdict 的 `confidence` 字段设为 `"offline_heuristic"`——该字段在现有 `JudgeVerdict` 类型中已存在，scorecard 中的 `narrative_judge_confidence_sample_missing` blocker 已会降低其权重。

**替代方案：**
- 默认 1（完全失败）：过于激进，mock eval 仍有结构性验证价值
- 保持 3 但仅标记 confidence：不解决"假高分"问题，分数仍会污染聚合

**影响：** 依赖 mock eval 分数的现存测试和 CI gate 可能需要调整预期值。需在实施后运行 `pnpm test:gate:quick` 验证。

### D2: benchmark-run.mjs 子测试失败时的处理

**选择：** 子测试不可用时从聚合中排除，输出 `not_run` 而非硬编码满分。

**理由：** 现有 `{ passRate: 1, total: 28, pass: 28 }` fallback 在进程崩溃时给出完全不反映现实的满分，比不报告更危险。

**替代方案：**
- passRate: 0：虽然保守，但会拉低总分，且不区分"测试失败"与"测试未跑"
- 直接 exit 1：过于粗暴，可能阻断其他子项的聚合

**实现：** 解析子测试结果失败时，不在 `combinedTotal`/`combinedPass` 中计入该项，输出 warning 并标注 `not_run`。

### D3: Mock 叙事关键词注入的删除

**选择：** 删除 `mockScenarios.ts` 中 `buildKeywordAppendSentence` 及 `（相关关键词：` 检测，删除 `eval-chat-quality.ts` 中拼接关键词提示的代码。

**理由：** 关键词注入形成了 eval → mock → eval 的闭合回路：eval 要求某关键词 → 注入到用户输入 → mock 回显到叙事 → eval 检测到关键词 → 通过。这不是测试，而是循环论证。

**影响：** mock 模式下的某些 eval 用例可能因叙事中缺少 `mustContainAny` 关键词而失败。这些失败是**真实的**——它们暴露了 mock 叙事对特定场景覆盖不足。应通过补充 mock 叙事或用 `live` 模式处理，而非注入关键词绕过。

### D4: low-signal fact 的 telemetry flag 而非拦截

**选择：** `extractFactKeywords` 对 low-signal 事实返回 `dmOnlyFactsPresent: true` 标记，但不改变拦截行为（`leakedFactCount` 仍为 0）。

**理由：** 直接拦截 low-signal 事实会导致大量误报（如"走廊尽头传来刮擦声"既是正常叙事也可能夹带世界观暗示），与现有 `"ignores low-signal scene overlap"` 测试用例的设计意图一致。telemetry flag 使运维可审计 low-signal 路径的通过率，在积累数据后再决定是否收紧。

**替代方案：**
- 直接拦截所有 DM-only 事实：误报率过高，已验证场景会被阻断
- 不做任何改动：low-signal 路径完全不可见，无法判断是否存在系统性绕过

### D5: 永久 skip 测试的处理

**选择：** `online-status.spec.ts:117` 和 `codex-browser-playthrough.spec.ts:18` 的 `test.skip(true)` 改为条件 skip 或删除。

**理由：** 永久 skip 的测试是死代码，不产生价值但会在代码搜索、重构和新人理解时造成混淆。

**实现：**
- `online-status.spec.ts` 的第 117 行测试标记为"后台不可用"——若后台功能已规划但未实现，改为 `test.skip(!process.env.ADMIN_PASSWORD)` 等条件 skip；若无规划，删除测试用例
- `codex-browser-playthrough.spec.ts` 的第 18 行——检查是否与 `codex-browser-playthrough.spec.ts` 整体功能重复，如果是则删除该 skip 测试

## Risks / Trade-offs

- **[Risk] mock eval 分数整体下降 → CI gate 可能不通过** → Mitigation: 先本地跑 `pnpm test:gate:quick` 确认影响面，必要时微调 gate 阈值而非回退默认分
- **[Risk] `narrative_quality_v2.json` hardFloor 提升导致 live 模式中更多 case 触发硬失败** → Mitigation: hardFloor 2 对 score=2 的拦截是合理的（"明显冲突"本应失败），若产生过多误报可在 1 个迭代后回顾数据
- **[Risk] 删除 `profession-rules.test.ts` 存根测试可能遗漏对 prompt 行为的审计点** → Mitigation: 存根测试不验证任何行为，其存在本身不提供保护。真正需要审计的 prompt 行为应在 promptfoo live 模式或 `benchmarks/llm-evals/cases.json` 中覆盖
- **[Risk] `foreshadowLedger` 的 fire-and-forget 测试改为真实异步断言后可能暴露隐性的 DB 依赖** → Mitigation: 新断言只验证内存行为（返回空数组），不访问真实 DB

## Open Questions

- `online-status.spec.ts` 中跳过的"后台不可用"测试，对应的后台功能是否仍有实现计划？若无，建议删除整个测试用例而不仅是修改 skip 条件
- `codex-browser-playthrough.spec.ts:18` 跳过的测试与同文件其他测试的关系——是否是冗余？
