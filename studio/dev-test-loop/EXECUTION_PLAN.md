# EXECUTION_PLAN — 实施路线图

> 不超过 15 项，包含依赖、允许路径、验证和回滚

## 实施总览

```
Phase 1: 审计+设计 ✅ 当前阶段
Phase 2: 核心闭环基础设施 (待批准)
Phase 3: 本地编排与质量门 (待批准)
Phase 4: CI 集成 + 试点 (待批准)
```

## Phase 2: 核心闭环基础设施

### IMPL-01: AgentContext 状态机 + WorkerState 类型

| 字段 | 内容 |
|------|------|
| **依赖** | 无 |
| **并行组** | wave-2-core |
| **风险级别** | L1 |
| **允许的生产路径** | `src/lib/ai/agentContext.ts` |
| **允许的测试路径** | `src/lib/ai/agentContext.test.ts` |
| **禁止路径** | `src/app/`, `src/store/`, `src/db/` |
| **验收** | WorkerState 枚举、StateTransition 类型、状态机纯函数、单元测试 |
| **回滚** | `git revert` |

### IMPL-02: Diff→Risk→Scope 自动路由

| 字段 | 内容 |
|------|------|
| **依赖** | IMPL-01 (依赖 WorkerState 类型) |
| **并行组** | wave-2-core |
| **风险级别** | L1 |
| **允许的生产路径** | `src/lib/ai/agentContext.ts` (新增函数) |
| **允许的测试路径** | `src/lib/ai/agentContext.test.ts` (新增测试) |
| **禁止路径** | 同上 |
| **验收** | inferTestScope 按路径返回正确 TestScope，单元覆盖 |
| **回滚** | `git revert` |

### IMPL-03: 假绿/吞错/退出码检测器

| 字段 | 内容 |
|------|------|
| **依赖** | 无 |
| **并行组** | wave-2-core |
| **风险级别** | L1 |
| **允许的生产路径** | `src/lib/testing/integrityChecker.ts` (新文件) |
| **允许的测试路径** | `src/lib/testing/integrityChecker.test.ts` (新文件) |
| **禁止路径** | 不修改任何现有测试文件 |
| **验收** | 检测 assert.ok(true)、test.skip(true)、fallback passRate:1、|| true 模式 |
| **回滚** | 删除新文件 |

### Gate 2-1

总控审查 IMPL-01/02/03 diff + 测试 + handoff → 集成 commit

## Phase 3: 本地编排与质量门

### IMPL-04: Dev→Test→Fix 状态机执行器

| 字段 | 内容 |
|------|------|
| **依赖** | Gate 2-1 (IMPL-01) |
| **并行组** | wave-3-local |
| **风险级别** | L2 |
| **允许的生产路径** | `src/lib/ai/agentContext.ts` (新增 runWorkerLoop) |
| **允许的测试路径** | `src/lib/ai/agentContext.test.ts` |
| **验收** | 状态转换正确、失败自动回环、循环上限、退出码 |
| **回滚** | `git revert` |

### IMPL-05: 统一 Test Runner CLI

| 字段 | 内容 |
|------|------|
| **依赖** | Gate 2-1 (IMPL-02, IMPL-03) |
| **并行组** | wave-3-local |
| **风险级别** | L2 |
| **允许的生产路径** | `scripts/test-runner.mjs` (新文件) |
| **允许的测试路径** | 对应 E2E/contract（修改 runner 自身） |
| **禁止路径** | `src/` |
| **验收** | `pnpm test:runner --risk L2` 正确选择 focused/adversarial/app/regression |
| **回滚** | 删除新文件 |

### IMPL-06: 报告/Provenance 强制执行

| 字段 | 内容 |
|------|------|
| **依赖** | Gate 2-1 (IMPL-01) |
| **并行组** | wave-3-local |
| **风险级别** | L1 |
| **允许的生产路径** | `src/lib/evals/harness/provenance.ts`, `src/lib/ai/agentContext.ts` |
| **允许的测试路径** | 新增 provenance 强制测试 |
| **验收** | AgentTestReport 强制包含 provenance、无 provenance 时报告警告 |
| **回滚** | `git revert` |

### Gate 3-1

总控集成 + 样例验证（一个预期通过、一个故意失败、一个环境阻塞）

## Phase 4: CI 集成 + 试点

### IMPL-07: CI Workflow 接入

| 字段 | 内容 |
|------|------|
| **依赖** | Gate 3-1 |
| **并行组** | — (串行，修改共享 CI) |
| **风险级别** | L3 |
| **允许的生产路径** | `.github/workflows/ci.yml` |
| **允许的测试路径** | — (CI 自己就是测试) |
| **验收** | CI 新增 test-integrity job，PR 门扩展 contract tests |
| **回滚** | `git revert` |

### IMPL-08: 试点 — 真实缺陷闭环

| 字段 | 内容 |
|------|------|
| **依赖** | Gate 3-1 |
| **并行组** | — (串行) |
| **风险级别** | L2-L3 |
| **验收** | 选一个真实缺陷 → 复现失败 → 修改代码 → focused → adversarial → app → regression → handoff |
| **回滚** | `git revert` |

### IMPL-09: 文档 + Codex 短启动提示词

| 字段 | 内容 |
|------|------|
| **依赖** | Gate 4-1 |
| **并行组** | — (串行) |
| **风险级别** | L0 |
| **允许的生产路径** | `docs/prompts/ai-dev-test-loop/` |
| **验收** | 更新后的 Worker 提示词、Codex task 启动提示词 |
| **回滚** | `git revert` |

## 不实施项

- 不创建独立测试 AI
- 不修改 `/api/chat` SSE/DM JSON 契约
- 不修改数据库 schema
- 不修改 analytics 事件名
- 不改变生产代码叙事行为
