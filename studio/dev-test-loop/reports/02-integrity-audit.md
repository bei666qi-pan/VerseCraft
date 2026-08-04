# VCDT-D02 测试完整性与 AI Eval 审计

> Audit date: 2026-07-24 | Auditor: Lead Orchestrator
> Scope: 恒真测试、吞错、弱断言、mock 自证、未校准 judge、provenance、确认偏差

## 1. 假通过测试现状

### 1.1 `assert.ok(true)` 存根测试

**搜索结论：当前代码中未发现 `assert.ok(true)` 存根测试。**

实际找到的断言：

| 文件 | 断言 | 评估 |
|------|------|------|
| `foreshadowLedger.test.ts:70` | `assert.ok(Array.isArray(result))` | 有效但弱 — 只验证返回值是数组，不验证数组内容 |
| `foreshadowLedger.test.ts` 注释 | "fire-and-forget 不阻塞" | 说明函数设计就是 fire-and-forget，测试遵循了设计 |
| `runLogger.test.ts:54` | `assert.ok(row)` | 有效 — 验证 row 非空 |
| `runLogger.test.ts:89` | `assert.ok(warnReason.includes("db unavailable"))` | 有效 — 验证错误原因字符串 |
| `profession-rules.test.ts` (18处) | 多种 `assert.ok()` | 全部有效 — 有实质性条件判断 |

**结论：`clean-test-integrity` OpenSpec 提案中描述的 `assert.ok(true)` 存根测试已不存在。** 可能是提案撰写后被清理，或提案描述的是历史状态。当前最弱断言是 `foreshadowLedger` 的 `assert.ok(Array.isArray(result))`。

### 1.2 永久 skip 测试

**搜索结论：`online-status.spec.ts` 和 `codex-browser-playthrough.spec.ts` 中未发现 `test.skip(true)`。**

当前 E2E 测试的 skip 都是条件性的（基于环境变量如 `E2E_AI_LIVE`），这是正确做法。

### 1.3 fire-and-forget 测试

`foreshadowLedger.test.ts` 有两处 fire-and-forget：
- Line 47: `insertForeshadowLedgerRows` — 注释说明"fire-and-forget 不阻塞"，测试验证不抛异常
- Line 75: `expireOverdueForeshadows` — 同上

这些符合函数的设计意图（fire-and-forget），但测试只验证"不崩溃"，不验证副作用。这是设计层面的取舍，不是测试缺陷。

## 2. Mock 闭环灌水审计

### 2.1 关键词注入

**`buildKeywordAppendSentence` 函数在当前代码中不存在。** 只在 `mockScenarios.ts:85` 的注释中被引用：

```typescript
//   → 「时间线」由 buildKeywordAppendSentence 从 eval mustContainAny 注入
```

该函数可能已被删除或从未实现。注释是历史残留。

### 2.2 mockScenarios.ts 实际行为

`mockScenarios.ts` 的注释显示了 eval 需求与 mock 场景的映射：
- `normal_action` 场景覆盖 `mustContainAny: ["走廊", "脚步", "墙根", "动静"]`
- 这些关键词是**直接硬编码在叙事文本中**的，而非运行时注入

**风险评估：** 当前 mock 叙事仍与 eval mustContainAny 对齐，因为场景是手工编写的。这不是运行时注入，但形成了"设计时耦合"——mock 场景被有意编写为覆盖 eval 关键词。这比运行时注入好，但仍存在 mock→eval 闭环风险。

### 2.3 eval-chat-quality.ts 关键词拼接

需要验证。若存在 `（相关关键词：...）` 前缀拼接到用户输入的代码，这将是直接的注入闭环。

## 3. 离线评分器审计

### 3.1 `evaluateOffline` 函数（`judgeExecutor.ts:445`）

**当前默认分已经是 2（保守）：**

```typescript
let score = 2; // 默认保守：未触发已知缺陷的维度不假定及格
```

**`judgeModel` 已是 `"offline_heuristic"`**（line 529）

**结论：`clean-test-integrity` 提案中关于默认分从 3 降为 2、置信度标注的建议已在当前代码中实现。**

### 3.2 `parseJudgeJsonOutput` 缺失维度处理

```typescript
if (typeof dimensionScores[dim.id] !== "number") {
    dimensionScores[dim.id] = 2; // 缺失维度默认为未验证
}
```

**默认值已经是 2，不是 3。** 与提案一致。

### 3.3 `computeWeightedAverage` 零权重处理

需验证此函数的默认值。若仍为 3，则需要修改。

## 4. Benchmark 回退审计

### 4.1 `benchmark-run.mjs` 安全测试回退

```javascript
let safetyPass = { passRate: 0, total: 0, pass: 0 };
// ...
log(`⚠  narrative safety 测试不可用，不计入 pass`);
```

**当前行为：不可用的子测试被排除（total=0, pass=0），而不是默认满分。** 这与 `clean-test-integrity` 提案的建议一致。

### 4.2 HTTP eval 失败降级

```javascript
// HTTP eval 失败，降级到离线
return {
    ok: true,
    mode: "fallback",
    score: judgePass.passRate,
    detail: { note: "HTTP eval failed, using offline fallback", judge: judgePass },
};
```

**问题：降级时 `ok: true`** — 即使 HTTP eval 失败，仍然返回 ok。这可能导致 CI 认为一切正常，但实际上只跑了离线降级。

## 5. Judge 校准审计

### 5.1 校准基础设施

存在 `src/lib/evals/judge/calibration.ts` 和 `calibration.test.ts`：
- 支持 Spearman 相关系数计算
- gold set 位于 `benchmarks/human-eval/gold-set.json`

### 5.2 实际使用情况

| 路径 | 是否使用校准 | 证据 |
|------|-------------|------|
| `eval:chat-quality` | ❓ 未确认 | 需要检查是否调用了 calibrateJudge |
| `eval:narrative-safety` | ❓ 未确认 | 同上 |
| `eval:playthrough:live` | ❓ 未确认 | 同上 |
| `run-quality-gate.ts` | ❌ 未使用 | 1119 行脚本中未见 calibrateJudge 调用 |

**结论：校准基础设施存在但未被实际质量判定链路使用。** Spearman >= 0.7 的校准门在 `docs/ai-dev-test-agent.md` 中有规定，但在代码中不强制。

## 6. Provenance 追踪审计

### 6.1 基础设施

`src/lib/evals/harness/provenance.ts` 实现了 `resolveExperimentProvenance()`：
- commit SHA
- promptVersion
- model
- config
- datasetVersion
- seed
- judgeProvenance

### 6.2 实际使用

`src/lib/ai/agentContext.ts` 调用了 `resolveExperimentProvenance`，在 `AgentTestReport` 中包含 `provenance` 字段。

但 `AgentTestReport` **只在 agentContext.ts 中定义，没有被任何 runner/controller 消费**。

**结论：provenance 追踪基础设施存在，但没有被实际测试流程强制执行。** 测试结果不强制携带 provenance 信息。

## 7. 同一 AI 确认偏差风险

### 7.1 当前缓解措施

| 措施 | 存在性 | 有效性 |
|------|--------|--------|
| Mock 优先策略 | ✅ | 部分 — mock 不能验证真实 AI 质量 |
| 离线启发式评分 | ✅ | 部分 — 只能检测结构性缺陷 |
| Judge 校准 | ✅ (基础设施) | ❌ — 未被实际使用 |
| Gold set | ✅ | ❌ — 未被 gate 消费 |
| 双人盲测 | ❌ | — |
| 黑盒约束 | ❌ | — |

### 7.2 LOOP-CONTRACT.md 的建议

LOOP-CONTRACT.md §3 提出了 7 条降低偏差的措施：
1. 暂停实现，重新读取需求 ✓ (合理)
2. 把 diff 当作不可信第三方提交 ✓ (合理)
3. 从 contract 推导预期 ✗ (需要强制执行机制)
4. 先找失败路径 ✗ (需要审查清单)
5. 检查边界路径 ✓ (部分已在 adversarial test 中)
6. UI 黑盒约束 ✓ (在 app test 中)
7. 测试本身是否真实执行 ✓ (合理)

**但所有这些措施都是"态度建议"，不是可执行的自动化检查。** Worker 提示词中有要求，但无法验证 Worker 是否真的执行了。

## 8. 关键发现汇总

1. **`assert.ok(true)` 存根测试已不存在** — clean-test-integrity 提案中的最严重问题已修复
2. **永久 skip 测试已不存在** — 当前 skip 都是条件性的
3. **`evaluateOffline` 默认分已是 2** — 保守策略已实现
4. **`judgeModel` 已是 `"offline_heuristic"`** — 置信度标注已实现
5. **Benchmark 不可用子测试已被排除而非给满分** — 回退行为合理
6. **但 HTTP eval 降级时仍返回 `ok: true`** — 这是一个隐蔽的假绿风险
7. **Mock 叙事与 eval 关键词存在"设计时耦合"** — 不是运行时注入但仍是闭合回路
8. **Judge 校准存在但未被强制使用** — Spearman >= 0.7 门未接线
9. **Provenance 追踪存在但未被强制执行** — 报告可不携带溯源信息
10. **同一 AI 确认偏差只有态度建议，无自动化强制** — 最大剩余风险

