# CURRENT_STATE — VerseCraft 开发测试闭环现状

> 基于 D01/D02/D03 审计报告综合而成 | 2026-07-24

## 总体评估

VerseCraft 拥有**数量庞大但缺乏统一编排**的测试基础设施。开发→测试→修复的自动化闭环作为概念存在于文档中，但作为强制执行机制完全不存在。

## 已有基础设施（强度评级）

| 组件 | 评级 | 说明 |
|------|------|------|
| Unit Tests | ⭐⭐⭐⭐ | ~100+ test files，覆盖 turn engine、validators、parsers、combat 等 |
| Contract Tests | ⭐⭐⭐ | DM JSON 形状、SSE 帧结构有专门测试 |
| E2E Tests | ⭐⭐⭐⭐ | 42 Playwright spec，覆盖 SSE、移动 UI、章节、存档 |
| Mock Provider | ⭐⭐⭐ | 丰富场景覆盖，但存在设计时 eval 耦合 |
| Eval Harness | ⭐⭐⭐ | judge、playthrough、detectors、rubrics 体系健全 |
| Quality Gate | ⭐⭐ | 1119 行单体脚本，与 CI 无连线 |
| CI Pipeline | ⭐⭐⭐⭐ | 分层门禁（PR/nightly/dispatch），结构清晰 |
| Benchmark Suite | ⭐⭐⭐ | chat-metrics、game-mechanics、human-eval |
| Agent Context | ⭐ | 类型定义存在，无 runner/controller |
| Provenance | ⭐⭐ | 基础设施存在，未强制执行 |

## 关键缺口

### 缺口 1：无强制执行闭环
- `AgentContext` 类型定义了但无状态机
- 模式切换（dev↔test）靠人工纪律
- 无失败自动回环到修复

### 缺口 2：CI PR 门太窄
- contract tests 不在 verify job 中
- eval/safety 只在 nightly 运行
- mock guardrails 不在 PR 路径

### 缺口 3：两套门禁体系不重合
- `test:ci`（CI 用）vs `test:gate`（本地用）内容不同
- quality gate（`run-quality-gate.ts`）不被 CI 消费

### 缺口 4：Live 验证完全依赖 secrets
- 本地开发者可能从未跑过真实网关测试
- 所有 PR E2E 跑在 `keys_missing` 降级模式

### 缺口 5：边界与恢复测试空白
- 无 SSE 中断恢复测试
- 无并发操作测试
- 无网络降级测试

### 缺口 6：同一 AI 确认偏差无系统缓解
- Judge 校准存在但未强制使用
- Provenance 追踪存在但未强制执行
- 无黑盒约束的自动化验证

## 已修复问题

- `assert.ok(true)` 存根测试已清理
- `test.skip(true)` 永久 skip 已清理
- `evaluateOffline` 默认分已降为 2（保守）
- `judgeModel` 已标注 `"offline_heuristic"`
- Benchmark 不可用子测试已被排除而非给满分

## 仍存在的隐蔽风险

| 风险 | 位置 | 严重程度 |
|------|------|----------|
| HTTP eval 失败降级时返回 `ok: true` | `benchmark-run.mjs` | 高 |
| Mock 叙事与 eval 关键词"设计时耦合" | `mockScenarios.ts` | 中 |
| Judge 校准门未接线 | `calibration.ts` | 中 |
| `test:gate:quick` 与 CI 结果可能矛盾 | 两套体系 | 高 |
| 无 pre-commit hook | 无 | 中 |

