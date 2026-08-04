# TASK_BOARD — 任务看板

> 当前状态：✅ **全部完成** — Wave 1+2+3 已实施，Gate 3 通过

## Phase 1: 审计+设计 ✅

| Task ID | 目标 | 状态 | 输出 |
|---------|------|------|------|
| VCDT-D01 | 流程与命令审计 | ✅ | `reports/01-workflow-audit.md` |
| VCDT-D02 | 测试完整性与 AI Eval 审计 | ✅ | `reports/02-integrity-audit.md` |
| VCDT-D03 | 应用验证与浏览器闭环审计 | ✅ | `reports/03-app-test-audit.md` |
| VCDT-D04 | 统一 Worker 工作流设计 | ✅ | `reports/04-worker-design.md` |
| VCDT-D05 | 编排、并行与集成设计 | ✅ | `reports/05-orchestration-design.md` |

## Phase 2: 核心闭环基础设施 (Wave 1) ✅

| Task ID | 目标 | 测试 | 行数 |
|---------|------|------|------|
| IMPL-01 | AgentContext 状态机 + WorkerState 类型 | 94/94 | +300 |
| IMPL-02 | Diff→Risk→Scope 自动路由 | 94/94 | (与 IMPL-01 同文件) |
| IMPL-03 | 假绿/吞错/退出码检测器 | 38/38 | 280 (新文件) |

**Gate 1:** ✅ 124/124

## Phase 3: 本地编排与质量门 (Wave 2) ✅

| Task ID | 目标 | 测试 | 行数 |
|---------|------|------|------|
| IMPL-04 | 状态追踪 + 转换验证 | 94/94 | +90 |
| IMPL-05 | 统一 Test Runner CLI | 手动验证 | 220 (新文件) |
| IMPL-06 | 报告/Provenance 强制执行 | 94/94 | +70 |

**Gate 2:** ✅ 145/145 + adversarial (pass + fail + blocked) + 99 pilot tests

## Phase 4: CI 集成 + 试点 (Wave 3) ✅

| Task ID | 目标 | 状态 |
|---------|------|------|
| IMPL-07 | CI Workflow 接入 | ✅ test-integrity job added |
| IMPL-08 | 试点 — 真实缺陷闭环 | ✅ foreshadowLedger assertion strengthened |
| IMPL-09 | 文档 + Codex 短启动提示词 | ✅ README updated |

**Gate 3:** ✅ 244/244 tests, 0 lint errors

## 依赖门

```
Gate 1.1: Phase 1 完成 → 用户评审 ✅
Gate 1 (Wave 1): IMPL-01/02/03 → 124/124 ✅
Gate 2 (Wave 2): IMPL-04/05/06 → 145/145 + adversarial ✅
Gate 3 (Wave 3): IMPL-07/08/09 → 244/244 + 0 lint ✅
```

## 全部改动文件

| 文件 | 改动类型 | 行数 |
|------|----------|------|
| `src/lib/ai/agentContext.ts` | 扩展 | ~700 (+400) |
| `src/lib/ai/agentContext.test.ts` | 扩展 | ~750 (+550) |
| `src/lib/testing/integrityChecker.ts` | 新建 | 280 |
| `src/lib/testing/integrityChecker.test.ts` | 新建 | 392 |
| `scripts/test-runner.mjs` | 新建 | 220 |
| `src/lib/narrativeGovernance/foreshadowLedger.test.ts` | 修复 | +15 |
| `.github/workflows/ci.yml` | 扩展 | +50 |
| `package.json` | 扩展 | +1 script |
| `docs/prompts/ai-dev-test-loop/README.md` | 更新 | 重写 |
| **合计** | | **~2,800 行** |
