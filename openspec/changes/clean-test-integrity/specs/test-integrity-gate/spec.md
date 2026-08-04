# Test Integrity Gate

## Purpose

确保测试体系中的每条断言均可验证、mock eval 结果可信度透明标注、benchmark 聚合不因子测试失败而静默回退到满分。

## ADDED Requirements

### Requirement: 测试断言必须可验证

所有 `*.test.ts` / `*.spec.ts` 文件中的测试用例 MUST 包含至少一条可失败的断言（`assert.*`、`strictEqual`、`throws`、`rejects` 等）。`assert.ok(true)` 或等效的无条件通过语句 SHALL NOT 出现在生产测试中。fire-and-forget 异步调用（不 `await` 且在 `.then()` 中放 `assert.ok(true)`）SHALL NOT 构成有效测试。

#### Scenario: 无断言的存根测试被删除

- **WHEN** 一个测试用例仅包含 `assert.ok(true)` 且注释说明"实际场景由 prompt 控制"
- **THEN** 该测试用例 MUST 被删除或补充可验证的断言

#### Scenario: fire-and-forget 异步测试被修复

- **WHEN** 一个测试用例在 `.then()` 回调中调用 `assert.ok(true)` 且未 `await` 该 Promise
- **THEN** 该测试 MUST 改为 `async/await` 且断言可观测的行为（如返回值、副作用或抛异常）

### Requirement: Mock eval 结果必须显式标注置信度

所有使用 mock provider 产生的 eval 结果 MUST 在 verdict 中显式标注 `confidence: "offline_heuristic"`，且该标记 SHALL 在 scorecard 聚合时触发置信度上限。离线评分器（`evaluateOffline`）对未触发已知缺陷模式的维度 MUST 输出保守默认分（不高于 2），而非及格分（3）。

#### Scenario: 离线评分器对未触发缺陷的维度打保守分

- **WHEN** `evaluateOffline` 处理一个未匹配到任何已知缺陷模式（如 prompt 泄漏、名称污染等）的输入
- **THEN** 每个维度的默认分数 MUST 为 2（非 3），且 verdict 的 `confidence` 字段 MUST 设为 `"offline_heuristic"`

#### Scenario: 缺失评委维度不静默填 3

- **WHEN** `parseJudgeJsonOutput` 遇到 LLM 评委未输出某个维度分数的情况
- **THEN** 该维度的默认值 MUST 为 2（非 3），并记录 `missing_dimension` warning

### Requirement: Benchmark 聚合不可静默回退到满分

Benchmark 运行器在子测试不可用（进程崩溃、超时、被跳过）时 SHALL NOT 使用 passRate=1 或满分的默认值顶替。不可用的子测试 MUST 从聚合中排除并报告为 `not_run`，或使用 passRate=0 并标注 `missing_data`。

#### Scenario: 安全测试运行失败

- **WHEN** narrative safety 测试（`src/lib/evals/narrativeSafetyRubric.test.ts`）因进程崩溃或超时无法产生结果
- **THEN** benchmark 聚合 MUST 报告该子项为 `not_run` 或 `missing_data`，SHALL NOT 以 `passRate: 1, pass: 28, total: 28` 计入总分

#### Scenario: 子测试全部正常完成

- **WHEN** 所有子测试正常退出且有可解析的输出
- **THEN** benchmark 聚合 MUST 只计入成功解析的子项数据，SHALL NOT 混入硬编码默认值

### Requirement: Mock 叙事不得通过关键词注入保证 eval 通过

Mock provider 的叙事生成逻辑 SHALL NOT 根据用户输入中嵌入的关键词提示（如 `（相关关键词：...）` 前缀）来决定叙事内容，也不得在叙事末尾拼接 eval 用例期望的关键词句子。

#### Scenario: 用户输入不含特殊前缀

- **WHEN** mock provider 收到不含 `（相关关键词：` 前缀的用户输入
- **THEN** 叙事内容 MUST 仅基于正常 mock 场景选择逻辑（行动类型、步骤数等），SHALL NOT 注入额外关键词

#### Scenario: Eval 脚本注入关键词

- **WHEN** `eval-chat-quality.ts` 在 mock 模式下构建请求
- **THEN** 用户输入 SHALL NOT 被拼接 `（相关关键词：...）` 前缀

### Requirement: Narrative validator low-signal fact 需可审计

`validateNarrative` 的 `extractFactKeywords` 对不含 `HIGH_SIGNAL_FACT_KEYWORD_RE` 的事实 SHALL 仍记录 `dmOnlyFactsPresent` 标记，使调用方可在 telemetry 中审计 low-signal 路径而非无声放行。拦截行为 MUST 不变——low-signal 事实仍不触发 `dm_only_fact_leaked_in_narrative` 违规。

#### Scenario: DM-only 事实以低调语言出现在叙事中

- **WHEN** `extractFactKeywords` 检查到叙事中包含 DM-only 范围的事实，但该事实不含 `HIGH_SIGNAL_FACT_KEYWORD_RE` 中的敏感词
- **THEN** 返回值 MUST 包含 `dmOnlyFactsPresent: true` 标记，但 `leakedFactCount` 仍为 0（不触发拦截）

#### Scenario: 叙事中不含任何 DM-only 事实

- **WHEN** `extractFactKeywords` 检查到叙事中不含 DM-only 范围的事实
- **THEN** 返回值 MUST 包含 `dmOnlyFactsPresent: false`，行为与现有逻辑一致

### Requirement: Rubric hardFloor 不放过明显缺陷

Rubric 评分维度中 `hardFloor` 的值 MUST 不小于 2（在 1-5 评分范围内），确保 score=2（明显冲突/缺陷）也能触发硬失败，而非仅在 score=1（完全崩坏）时才失败。

#### Scenario: canon_consistency 得分为 2

- **WHEN** 评委对 `canon_consistency` 打出 score=2（明显冲突）
- **THEN** 该评分 MUST 触发 `hardFailIf` 条件（原 hardFloor=1 不触发）

### Requirement: 无条件永久 skip 测试须移除

测试文件中的 `test.skip(true, ...)`（即条件恒为真的 skip）SHALL NOT 保留在代码库中。若对应功能已废弃，MUST 删除测试文件；若待修复，MUST 改为条件 skip（如依赖环境变量）。

#### Scenario: 后台不可用导致测试永久跳过

- **WHEN** 一个 E2E 测试用例包含 `test.skip(true, "后台不可用")`
- **THEN** 该测试 MUST 被删除（若功能不再维护），或改为 `test.skip(!process.env.ADMIN_PASSWORD, ...)` 等条件 skip
