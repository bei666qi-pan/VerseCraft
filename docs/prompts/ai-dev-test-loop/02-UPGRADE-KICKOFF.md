# VerseCraft 统一开发测试闭环实施总控提示词

## 进入条件

用户已批准：

- `studio/dev-test-loop/LOOP_DESIGN.md`
- `studio/dev-test-loop/RISK_MATRIX.md`
- `studio/dev-test-loop/TEST_SCOPE_MAP.md`
- `studio/dev-test-loop/INTEGRITY_RULES.md`
- `studio/dev-test-loop/EXECUTION_PLAN.md`

## 实施原则

继续担任总控。重新读取 `AGENTS.md`、上述权威文件、本目录 `LOOP-CONTRACT.md` 与 `01-UNIFIED-WORKER.md`，检查当前 git 状态和真实实现。

不得创建独立测试 AI。每个实施 task 必须是完整功能负责人，并在同一 task 内完成实现、测试、应用操作、修复和复测。

## 先建立依赖与文件矩阵

每个 task 必须包含：

```text
task_id
objective
depends_on
parallel_group
input_commit
risk_level
allowed_production_paths
allowed_test_paths
forbidden_paths
required_test_modes
acceptance_checks
integration_owner
rollback
```

同一并行组的生产文件、测试文件和生成报告路径都必须互不重叠。共享入口、共享测试配置、package scripts、CI workflow 和权威文档只能由唯一 integration owner 修改。

## 建议实施波次

必须根据真实审计调整，不可机械照搬。

### Wave 1：闭环契约与报告基础

可并行：

- 统一任务上下文、风险分级与报告 schema。
- 测试范围映射的纯逻辑与单元测试。
- 假绿/吞错/退出码完整性检测器。

前提：文件范围互斥。每项均由同一 AI 写实现和测试。

### Gate 1

总控审查 Wave 1 diff、测试与 handoff，形成集成 commit。只有 contract 稳定后，依赖它的命令编排和 CI task 才能启动。

### Wave 2：本地编排与质量门

可并行：

- diff/risk 到 focused test scope 的选择器及测试。
- dev→test→fix→retest 状态与恢复逻辑及测试。
- 测试报告/provenance/失败分类及测试。

不得由不同 task 同时修改同一个 runner、package.json 或共享 schema；共享接线留给 integration owner。

### Gate 2

总控集成并在真实仓库样例上验证：至少一个预期通过任务、一个故意失败任务、一个环境阻塞任务，证明报告不会误绿。

### Wave 3：应用验证与 CI 接线

按文件范围串并结合：

- Browser/Playwright 真实应用验证入口。
- API/SSE/store/AI 不同风险 lane 的命令接线。
- CI 或本地 quality gate 接入。
- 文档、模板和 Codex 短启动提示词。

影响同一 workflow、package.json 或统一 runner 的任务必须串行，由唯一集成人修改。

### Gate 3：端到端自举验证

选择一个小而真实的 VerseCraft 缺陷或改进作为试点，由一个统一 Worker 完成：

```text
复现失败
→ 修改生产代码
→ focused test
→ adversarial test
→ 真实应用测试
→ 发现问题并自行修复
→ regression
→ handoff
```

试点不能拆成开发 task 和测试 task。用其运行记录证明闭环真正可用，而不是只有文档和类型。

## 总控集成责任

- 使用 task 创建、读取、等待和消息能力持续协调。
- 不以“task 已完成”代替 diff、命令、退出码和证据审查。
- 功能作者遗漏测试时，把 task 退回原作者补齐，不另开测试 task。
- 集成冲突由总控修复后，总控必须测试自己的集成修改。
- 下游只从已验收的集成 commit 启动。

## 完成定义

- 不存在独立测试 AI 或测试专属 task。
- 每个试点和实施 task 的生产/测试/修复证据来自同一个 AI。
- focused→adversarial→app→regression 状态可追踪、可恢复。
- 风险分级不会让小改动反复跑全部重门，也不会让高风险改动逃过真实应用测试。
- 至少证明一次测试能够真实变红、修复后变绿；没有 fallback 或吞错制造绿色。
- UI、API/SSE、store/存档和 AI/prompt 均有明确测试路由。
- 暗月、旧存档、SSE 和 DM JSON 契约未被破坏。
- 所有 task 有独立 worktree、互斥路径、handoff 和可审查 commit。

最终报告改动、task/commit、闭环试点记录、测试命令与退出码、浏览器/API 证据、CI/本地门、已知限制和回滚方案。
