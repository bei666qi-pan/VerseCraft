# VCDT-LEAD 总控 Handoff

## 任务卡

- **Task ID:** VCDT-LEAD
- **Objective:** 完整阅读 AGENTS.md 及 ai-dev-test-loop 全部文档，严格按总控提示词建立多 task 团队，审计 VerseCraft 现有开发测试闭环并完成设计整合
- **Risk level:** L0 (只读审计+设计，不修改代码)
- **Depends on:** 无
- **Parallel group:** — (单 task)
- **Input commit:** `b469908` (working tree dirty — 大量未提交改动)
- **Allowed paths:** `studio/dev-test-loop/**`, `docs/prompts/ai-dev-test-loop/**`
- **Forbidden paths:** `src/**`, `e2e/**`, `scripts/**`, `.github/**`, `openspec/**`
- **Integration owner:** Lead Orchestrator (本 task)

## 验收标准

| 标准 | 证据 | 结果 |
|------|------|------|
| 完整阅读 AGENTS.md | 已阅读 696 行，提取不可破坏契约 | ✅ |
| 完整阅读 docs/ai-dev-test-agent.md | 已阅读 156 行，对比实际代码 | ✅ |
| 完整阅读 LOOP-CONTRACT.md | 已阅读，理解 v2 契约升级 | ✅ |
| 完整阅读 00-LEAD-ORCHESTRATOR.md | 已阅读，以此为执行蓝图 | ✅ |
| 完整阅读 01-UNIFIED-WORKER.md | 已阅读，理解 Worker 提示词 | ✅ |
| 审计现有开发测试闭环 (D01-D03) | 3 份审计报告已写入 | ✅ |
| 设计统一 Worker 工作流 (D04) | 1 份设计报告已写入 | ✅ |
| 设计编排与并行方案 (D05) | 1 份设计报告已写入 | ✅ |
| 综合文档 (CURRENT_STATE 等 4 份) | 已写入 | ✅ |
| 设计文档 (LOOP_DESIGN 等 4 份) | 已写入 | ✅ |
| 未创建独立测试 AI | 零独立测试 task | ✅ |
| 未实施业务代码 | `src/**` 零修改 | ✅ |
| 未实施工作流代码 | `scripts/**` 零修改 | ✅ |

## 已创建的 Task 与报告

### 审计 Task (Phase 1, Wave 1)

| Task | 报告路径 | 主要发现 |
|------|----------|----------|
| VCDT-D01 | `reports/01-workflow-audit.md` | dev→test→fix 自动化闭环不存在；100 scripts 缺乏编排；CI PR 门太窄 |
| VCDT-D02 | `reports/02-integrity-audit.md` | 假绿已大幅清理，但隐蔽风险仍在；judge 校准未接线 |
| VCDT-D03 | `reports/03-app-test-audit.md` | 42 E2E spec 但全部降级模式；边界/恢复测试空白 |

### 设计 Task (Phase 1, Wave 2)

| Task | 报告路径 | 主要内容 |
|------|----------|----------|
| VCDT-D04 | `reports/04-worker-design.md` | 10 状态状态机；姿态切换；自动测试范围选择；完成定义强制 |
| VCDT-D05 | `reports/05-orchestration-design.md` | 依赖 DAG；并行组规则；文件互斥；integration owner 职责 |

### 综合文档

| 文档 | 路径 |
|------|------|
| 现状总览 | `CURRENT_STATE.md` |
| 风险矩阵 | `RISK_MATRIX.md` |
| 测试范围映射 | `TEST_SCOPE_MAP.md` |
| 完整性红线 | `INTEGRITY_RULES.md` |
| 闭环设计 | `LOOP_DESIGN.md` |
| 实施计划 | `EXECUTION_PLAN.md` |
| 关键决策 | `DECISIONS.md` |
| 任务看板 | `TASK_BOARD.md` |

## 主要缺陷汇总

1. **dev→test→fix 自动化闭环不存在** — 类型定义有，强制机制无（最高优先级）
2. **CI PR 门太窄** — contract/eval/safety 不在 required 路径
3. **两套门禁体系不重合** — test:ci vs test:gate 内容不同
4. **Judge 校准未接线** — Spearman >= 0.7 门存在但未被强制执行
5. **Provenance 追踪未强制执行** — 测试报告可不携带溯源信息
6. **边界/恢复测试空白** — SSE 中断、并发、网络降级
7. **Live 验证完全依赖 secrets** — 本地开发者无法跑真实网关测试
8. **同一 AI 确认偏差无系统缓解** — 只有态度建议，无自动化强制

## 关键决策 (10 项)

详见 `DECISIONS.md`。核心：
- 不创建独立测试 AI
- 使用状态机而非自由 Agent
- 风险路由替代固定测试矩阵
- 文件范围互斥 + Integration Owner
- Phase 1 不实施业务代码

## 实施任务 (9 项, 分 3 波)

详见 `EXECUTION_PLAN.md` 和 `TASK_BOARD.md`：
- Wave 2: IMPL-01/02/03 (AgentContext 状态机、路由、假绿检测)
- Wave 3: IMPL-04/05/06 (状态机执行器、Runner CLI、Provenance)
- Wave 4: IMPL-07/08/09 (CI 接入、试点、文档)

## 需用户确认的问题

1. **设计批准：** 是否批准当前 LOOP_DESIGN.md、EXECUTION_PLAN.md 和 DECISIONS.md？
2. **实施授权：** 是否授权进入 Phase 2（IMPL-01/02/03 核心闭环基础设施）？
3. **范围确认：** Phase 2-4 是否有需要调整的优先级或范围？
4. **资源确认：** 实施阶段是否需要真实 AI gateway 配额用于 live 验证？
5. **已有未提交改动处理：** 当前 working tree 有大量 dirty files（见 git status），是否需要在实施前清理或提交？

## 未执行项与原因

| 项目 | 原因 |
|------|------|
| 实施业务代码 | Phase 1 不实施 |
| 实施工作流代码 | Phase 1 不实施 |
| 运行自动化测试 | 审计+设计阶段不涉及代码修改 |
| 浏览器验证 | 审计+设计阶段不涉及 UI 改动 |

## 风险与回滚

- **剩余风险：** 设计基于当前代码快照，后续代码修改可能导致设计需要调整
- **回滚方式：** `rm -rf studio/dev-test-loop/` 清除所有审计和设计产出

## Git

- **Branch:** main (dirty)
- **Input Commit:** `b469908`
- **产出路径：** `studio/dev-test-loop/**`（全部为新增 untracked 文件）

