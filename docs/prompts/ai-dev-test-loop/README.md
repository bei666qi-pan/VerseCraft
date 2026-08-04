# VerseCraft 统一开发测试 AI 团队使用说明

> **状态：Wave 1+2 已实施，Wave 3 实施中**

这套提示词用于升级 VerseCraft 的 AI 软件开发与测试闭环。核心规则是：

> 谁开发，谁测试，谁修复，谁复测，谁提供证据。不存在把代码交给独立测试 AI 的流程。

## 已实施的组件

| 组件 | 位置 | 说明 |
|------|------|------|
| Worker 状态机 | `src/lib/ai/agentContext.ts` | 10 状态 + 18 转换 + 纯函数 |
| 风险路由 | `src/lib/ai/agentContext.ts` | L0-L4 自动推断 + 预算 + 必需测试模式 |
| 完整性检测器 | `src/lib/testing/integrityChecker.ts` | 5 条检测规则 (R1-R4, R8) |
| 测试执行器 | `scripts/test-runner.mjs` | diff/risk → 自动测试选择 |
| CI 完整性门 | `.github/workflows/ci.yml` | test-integrity job |
| 报告验证 | `src/lib/ai/agentContext.ts` | provenance 强制 + 完整性检查 |

## 使用方法

### 作为 Worker

```text
你是 VerseCraft 的功能负责 AI。你必须同时完成开发、测试、修复和复测。

加载:
- docs/prompts/ai-dev-test-loop/01-UNIFIED-WORKER.md
- AGENTS.md

使用工具:
- src/lib/ai/agentContext.ts（状态追踪）
- src/lib/testing/integrityChecker.ts（假绿检测）
- scripts/test-runner.mjs --risk L2（自动测试）
```

### 作为总控

```text
你是 VerseCraft 的工程负责人。负责任务拆分、依赖管理、文件所有权和集成门。

加载:
- docs/prompts/ai-dev-test-loop/00-LEAD-ORCHESTRATOR.md
- studio/dev-test-loop/LOOP_DESIGN.md
- studio/dev-test-loop/EXECUTION_PLAN.md
```

### 本地命令

```bash
# 自动测试（根据风险级别）
node scripts/test-runner.mjs --risk L2 --mode quick

# 完整性扫描
pnpm test:integrity

# 从 diff 推断风险并测试
node scripts/test-runner.mjs --diff "$(git diff --name-only HEAD)"

# 完整门禁
node scripts/test-runner.mjs --risk L3 --mode full --json-out .runtime-data/report.json
```

## 快速启动 Codex Task

在 Codex App 中，选择现有本地 checkout `/Users/qi/Desktop/VerseCraft`：

**功能开发：**
```text
你是 VerseCraft 的功能负责 AI。阅读 AGENTS.md 和 docs/prompts/ai-dev-test-loop/01-UNIFIED-WORKER.md。
使用 src/lib/ai/agentContext.ts 追踪你的状态。
使用 scripts/test-runner.mjs --diff "<你的改动>" 自动测试。
使用 src/lib/testing/integrityChecker.ts 扫描假绿。
完成 UNDERSTAND → BASELINE → RED → IMPLEMENT → FOCUSED_TEST → ADVERSARIAL_TEST → APP_TEST → REGRESSION → HANDOFF。
```

**总控协调：**
```text
你是 VerseCraft 的工程负责人。阅读 docs/prompts/ai-dev-test-loop/00-LEAD-ORCHESTRATOR.md。
阅读 studio/dev-test-loop/LOOP_DESIGN.md 和 EXECUTION_PLAN.md。
创建独立 worktree task，管理文件所有权和依赖 DAG。
每个 task 由同一个 AI 完成开发+测试+修复+复测。
```
