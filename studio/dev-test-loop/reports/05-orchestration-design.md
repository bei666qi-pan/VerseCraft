# VCDT-D05 编排、并行与集成设计

> Design date: 2026-07-24 | Designer: Lead Orchestrator
> Scope: 依赖 DAG、parallel group、worktree、integration owner、串行化冲突

## 1. 架构概览

```
                      ┌──────────────┐
                      │LEAD ORCHESTRATOR│
                      │  (总控 AI)     │
                      └──────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼───────┐ ┌───▼──────────┐
     │  WORKER A     │ │  WORKER B  │ │  WORKER C    │
     │  功能负责 AI   │ │  功能负责 AI│ │  功能负责 AI  │
     │  dev+test+fix │ │ dev+test+fix│ │ dev+test+fix │
     └───────────────┘ └────────────┘ └──────────────┘
```

- 总控：拆任务、管依赖、管文件范围、审查证据、做集成
- Worker：完整功能负责人 — 理解 + 复现 + 实现 + 测试 + 修复 + 复测 + 报告
- **不存在独立测试 AI**

## 2. 任务卡协议

### 2.1 完整格式

```yaml
task_id: "VCDT-D01"
objective: "审计现有 dev→test→fix 流程"
depends_on: []
parallel_group: "audit-wave-1"
input_commit: "b469908"
risk_level: "L0"  # 只读审计，无代码修改
allowed_production_paths: []  # 第一阶段不修改生产代码
allowed_test_paths: []
forbidden_paths:
  - "src/**"
  - "e2e/**"
  - "scripts/**"
  - ".github/**"
required_test_modes: []  # 审计任务不需要测试
acceptance_checks:
  - "reports/01-workflow-audit.md 已写入"
  - "handoffs/VCDT-D01-handoff.md 已写入"
integration_owner: "lead-orchestrator"
rollback: "git checkout -- studio/dev-test-loop/reports/01-workflow-audit.md"
```

### 2.2 必填字段验证

```typescript
const REQUIRED_FIELDS = [
  "task_id", "objective", "depends_on", "parallel_group",
  "input_commit", "risk_level", "allowed_production_paths",
  "allowed_test_paths", "forbidden_paths",
  "required_test_modes", "acceptance_checks",
  "integration_owner", "rollback"
];
```

## 3. 依赖 DAG

### 3.1 当前升级项目的 DAG

```
Wave 1 (审计) — 全部并行
  VCDT-D01 (workflow audit)     ─┐
  VCDT-D02 (integrity audit)    ─┼─ 文件范围互斥
  VCDT-D03 (app test audit)     ─┘

  Gate 1: 总控审阅审计报告 → 生成 CURRENT_STATE 等

Wave 2 (设计) — 全部并行
  VCDT-D04 (worker design)      ─┐
  VCDT-D05 (orchestration)      ─┘  文件范围互斥

  Gate 2: 总控审阅设计 → 生成 LOOP_DESIGN 等
```

### 3.2 未来实施项目的 DAG 示例

```
Wave 1 (闭环契约 + 报告基础) — 并行
  IMPL-01 (AgentContext 状态机)      ─┐
  IMPL-02 (测试范围映射逻辑)         ─┼─ 文件互斥
  IMPL-03 (假绿检测器)              ─┘

  Gate 1: 总控审查 + 集成 commit

Wave 2 (本地编排 + 质量门) — 并行 (不同 runner)
  IMPL-04 (diff→risk 选择器)        ─┐
  IMPL-05 (dev→test→fix 状态机)     ─┤ 共享 schema 留给 integrator
  IMPL-06 (报告/provenance)         ─┘

  Gate 2: 总控集成 + 样例验证

Wave 3 (应用验证 + CI 接线) — 串并结合
  IMPL-07 (Browser/Playwright 入口)  (独立)
  IMPL-08 (API/SSE/store 命令接线)  (独立)
  IMPL-09 (CI workflow 接入)        (依赖 IMPL-07 + IMPL-08)

  Gate 3: 总控端到端自举验证
```

## 4. 并行组规则

### 4.1 文件范围互斥

同一 parallel group 中的 task，以下路径集合必须互斥：

```
Worker A:
  allowed_production_paths: ["src/lib/ai/agentContext.ts"]
  allowed_test_paths: ["src/lib/ai/agentContext.test.ts"]

Worker B:
  allowed_production_paths: ["src/lib/turnEngine/types.ts"]
  allowed_test_paths: ["src/lib/turnEngine/types.test.ts"]

→ 无重叠 → 可并行
```

### 4.2 共享入口的冲突解决

当两个 task 需要修改同一文件时：

| 冲突类型 | 解决方案 |
|----------|----------|
| 共享入口文件（如 `route.ts`） | 串行执行，由 integration owner 修改 |
| 共享测试配置（如 `package.json`） | 集成窗口由 integration owner 统一修改 |
| CI workflow | 集成窗口由 integration owner 统一修改 |
| 权威文档（如 `AGENTS.md`） | 集成窗口由 integration owner 统一修改 |

### 4.3 测试文件归属

**每个 task 同时拥有其生产文件和对应测试文件。** 不能把测试文件划给另一个 task。

```
正确:
  Worker A: src/lib/ai/agentContext.ts + src/lib/ai/agentContext.test.ts

错误:
  Worker A: src/lib/ai/agentContext.ts
  Worker B: src/lib/ai/agentContext.test.ts  ← 禁止
```

## 5. Integration Owner 职责

### 5.1 总控作为 Integration Owner

- 使用 task 创建、读取、等待能力持续协调
- 不以"task 已完成"代替 diff、命令、退出码和证据审查
- 功能作者遗漏测试时，把 task 退回原作者补齐
- 集成冲突由总控修复后，总控必须测试自己的集成修改
- 下游只从已验收的集成 commit 启动

### 5.2 集成窗口流程

```
1. 所有 parallel group task 提交 handoff
2. 总控逐份审查 handoff + diff + 测试证据
3. 不合规 → 退回 task 作者修复
4. 合规 → 总控执行 merge/rebase
5. 总控运行集成测试（至少 focused + regression）
6. 集成测试通过 → 形成集成 commit
7. 释放依赖 gate，下游 task 可以启动
```

### 5.3 总控自身的测试

总控在修改共享文件（package.json、scripts、CI workflow、AGENTS.md）后，必须：
1. 运行 `npx eslint .`
2. 运行 `pnpm test:unit`
3. 运行 `pnpm build`
4. 记录集成 commit 和测试结果

## 6. 串行化决策树

```
两个 task 是否需要串行？

1. 是否修改同一文件？
   YES → 串行（由 integration owner 在集成窗口修改）
   NO → 继续

2. 是否存在依赖关系（下游需要上游的 contract）？
   YES → 串行（下游等上游集成 commit）
   NO → 继续

3. 是否共享测试环境（同一 dev server/DB）？
   YES → 串行或使用独立 worktree
   NO → 可并行
```

## 7. Worktree 策略

### 7.1 独立 Worktree

每个并行 Worker 使用独立的 git worktree：

```bash
# 总控创建 worktree
git worktree add /tmp/versecraft-worker-A b469908
git worktree add /tmp/versecraft-worker-B b469908

# Worker A 在独立 worktree 中工作
cd /tmp/versecraft-worker-A

# 完成后总控清理
git worktree remove /tmp/versecraft-worker-A
```

### 7.2 何时需要独立 Worktree

- 同一 parallel group 中的 task → 必须独立 worktree
- 串行 task → 可共享 worktree（同一分支）
- 只读审计 task → 可共享 worktree（不修改文件）

## 8. 总控的读取、等待、追问和恢复

### 8.1 状态监控

总控通过 handoff 文件监控各 Worker 状态：

```bash
# 检查所有 Worker 状态
cat studio/dev-test-loop/handoffs/VCDT-*.md | grep "state:"
```

### 8.2 等待策略

| 场景 | 等待方式 |
|------|----------|
| 并行 group 全部完成 | 轮询 handoff 文件（每 30s） |
| 单个 task 超时 | 总控主动检查并追问 |
| 依赖 gate 未满足 | 总控阻塞下游启动 |

### 8.3 追问协议

当 Worker handoff 存在以下问题时，总控追问：
- 验收标准有未覆盖项
- 测试退出码未记录
- 存在未解释的 skip
- handoff 中有禁止结束语
- 文件范围超出允许路径

### 8.4 恢复协议

```
总控发现 task 被中断:
  1. 读取该 task 最新 handoff
  2. 确定当前状态 (UNDERSTAND→...→HANDOFF)
  3. 从当前状态恢复（不重复已完成工作）
  4. 如果中断超过 24h：重新 BASELINE（检查 git 状态变化）
```

## 9. 分阶段落地计划

### Phase 1: 审计+设计 (当前阶段)
- ✅ 三份审计报告 (D01-D03)
- ✅ 四份综合文档 (CURRENT_STATE, RISK_MATRIX, TEST_SCOPE_MAP, INTEGRITY_RULES)
- 进行中: 两份设计报告 (D04-D05)
- 待完成: LOOP_DESIGN.md, EXECUTION_PLAN.md, DECISIONS.md, TASK_BOARD.md
- **不实施任何业务代码或工作流代码**

### Phase 2: 核心闭环基础设施 (待批准)
- IMPL-01: AgentContext 状态机 + 类型完善
- IMPL-02: Diff→Risk→Scope 自动路由
- IMPL-03: 假绿/吞错/退出码检测器

### Phase 3: 本地编排与质量门 (待批准)
- IMPL-04: Dev→Test→Fix 状态机执行器
- IMPL-05: 测试报告/Provenance 集成
- IMPL-06: 统一 test runner CLI

### Phase 4: CI 集成 + 试点 (待批准)
- IMPL-07: CI workflow 接入
- IMPL-08: 试点：选一个真实缺陷完成完整闭环
- IMPL-09: 文档 + Codex 短启动提示词

## 10. 回滚与观测

### 10.1 回滚策略

| 层级 | 回滚方式 |
|------|----------|
| 单个 task | `git revert <task-commit>` |
| 整个 wave | `git reset --hard <pre-wave-commit>` |
| 配置/脚本 | 恢复旧版 package.json + CI workflow |
| 类型/接口 | 保留向后兼容（新增字段，不删旧字段） |

### 10.2 观测指标

| 指标 | 测量方式 |
|------|----------|
| 假绿检测率 | 完整性检查器发现的违规数 |
| 闭环完成率 | handoff 中所有阶段都有证据的 task 比例 |
| 反馈时长 | focused test 从触发到结果的时间 |
| CI 信号准确率 | CI 失败但实际是假绿的次数 |
| 证据完整性 | handoff 中缺失退出码/截图的 task 比例 |

