# VerseCraft Self-Improving Agent System

## 架构

VerseCraft 评测驱动多 Agent 自修复闭环（Eval-Driven Multi-Agent Self-Repair System）是一个可重复执行、可恢复、可观测的状态机，用于自动发现、诊断和修复游戏玩法缺陷。

### 核心流程

```
discovery → baseline → [Round Loop] → reporting → stopped

Round Loop:
  scenario_building → game_execution → judging → triage
  → repair → quality_gate → [loop back or stop]
```

### 组件概览

| 组件 | 路径 | 职责 |
|------|------|------|
| Orchestrator | `src/lib/evals/selfImprove/orchestrator.ts` | 主协调器，串联全流程 |
| State Machine | `src/lib/evals/selfImprove/stateMachine.ts` | 阶段转换、状态持久化、中断恢复 |
| Scenario Pool | `src/lib/evals/selfImprove/scenarioPool.ts` | 场景管理（Golden/Regression/Replay/Boundary/Fuzz） |
| Game Runner | `src/lib/evals/selfImprove/gameRunner.ts` | 游戏回合执行（Mock + Live） |
| Judge Ensemble | `src/lib/evals/selfImprove/judgeEnsemble.ts` | 3 个专业 Judge（Gameplay Legality / NPC Fact Grounding / Playability Agency） |
| Defect Triage | `src/lib/evals/selfImprove/defectTriage.ts` | 缺陷签名生成、去重、证据校验、置信度仲裁 |
| Repair Plan | `src/lib/evals/selfImprove/repairPlan.ts` | 修复方案生成（9 个类别知识库） |
| Quality Gate | `src/lib/evals/selfImprove/qualityGate.ts` | 测试门禁（单元 + E2E + Build） |
| Stop Policy | `src/lib/evals/selfImprove/stopPolicy.ts` | 停止条件评估（成功/阻塞/退化） |
| Budget Tracker | `src/lib/evals/selfImprove/budget.ts` | 回合/模型调用/时间预算追踪 |
| Trace Store | `src/lib/evals/selfImprove/traceStore.ts` | JSONL 执行轨迹持久化 |

### Judge Ensemble

系统使用 3 个专业 Judge，而非单一泛化 Judge：

1. **Gameplay Legality**：动作合法性、资源/物品/职业/任务/状态转换
2. **NPC and Fact Grounding**：NPC 是否在场、是否有知识来源、是否泄露未允许事实
3. **Playability and Agency**：选项可执行性、是否有有效选择、玩家行动是否产生有意义的后果

每个 Judge 输出结构化 Verdict，包含评分、违规列表、证据和置信度。

---

## 命令

```bash
# Dry-run（Mock 模式，不修改代码）
pnpm self-improve:dry-run

# 建立基线
pnpm self-improve:baseline

# 运行完整自修复流程
pnpm self-improve:run -- --profile smoke --max-rounds 3
pnpm self-improve:run -- --profile standard
pnpm self-improve:run -- --scenario-ids golden-explore-room,boundary-nonexistent-item

# 恢复中断的运行
pnpm self-improve:resume -- --run-id <runId>

# 查看运行报告
pnpm self-improve:report -- --run-id <runId>
```

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--profile` | 运行模式：`smoke`、`standard` | `smoke` |
| `--max-rounds` | 最大修复轮数 | profile 默认值 |
| `--scenario-ids` | 仅运行指定场景（逗号分隔） | 全部 Dev Set |
| `--dry-run` | 不实际修改代码 | `false` |
| `--run-id` | 恢复/查看指定的运行 ID | 必填 |

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SI_LIVE_MODE` | 设为 `1` 启用真实模型调用 | 未设置（Mock） |
| `SI_MAX_ROUNDS` | 覆盖最大修复轮数 | Profile 默认 |
| `SI_MAX_LIVE_CALLS` | 覆盖最大模型调用数 | Profile 默认 |
| `SI_MAX_DURATION_MIN` | 覆盖最大运行时间（分钟） | Profile 默认 |
| `SI_GAME_CONCURRENCY` | 并发游戏 Agent 数 | 4 (smoke) |
| `SI_JUDGE_CONCURRENCY` | 并发 Judge 调用数 | 3 (smoke) |
| `SI_JUDGES_PER_CASE` | 每个案例的 Judge 数 | 3 |
| `SI_MIN_JUDGE_CONFIDENCE` | Judge 最低置信度阈值 | 0.80 |
| `SI_REQUIRED_JUDGE_AGREEMENT` | 自动修复所需最少 Judge 一致数 | 2 |
| `LIVEPLAY_BASE_URL` | `/api/chat` 基础 URL | `http://localhost:666` |

---

## Mock 与 Live 的区别

### Mock 模式（默认）

- 游戏回合使用预定义的模拟 DM JSON 响应
- Judge 使用启发式规则（关键词匹配、结构检查）
- 不消耗 API 配额
- 适合：CI 集成、快速验证、场景开发
- 限制：无法检测需要真实模型理解的复杂缺陷

### Live 模式

```bash
# 先启动 dev server
pnpm dev

# 在另一个终端运行 live self-improve
SI_LIVE_MODE=1 pnpm self-improve:run -- --profile smoke
```

- 游戏回合调用真实 `/api/chat` SSE 端点
- Judge 调用真实 LLM（通过 AI Gateway）
- 消耗 API 配额
- 适合：正式质量评估、发布前门禁
- 要求：`dev server` 运行中 + AI Gateway 已配置

---

## 如何启用真实模型

1. 确保 `.env.local` 中已配置 AI Gateway：
   ```env
   AI_GATEWAY_BASE_URL=https://your-gateway/v1
   AI_GATEWAY_API_KEY=sk-xxx
   AI_MODEL_MAIN=deepseek-chat
   AI_MODEL_ENHANCE=deepseek-chat
   ```

2. 启动 dev server：
   ```bash
   pnpm dev
   ```

3. 运行 live self-improve：
   ```bash
   SI_LIVE_MODE=1 pnpm self-improve:run -- --profile smoke
   ```

---

## 预算

### Smoke Profile（默认）

| 项目 | 限制 |
|------|------|
| 最大轮数 | 3 |
| 最大模型调用数 | 80 |
| 最大运行时间 | 60 分钟 |
| 并发 Game Agent | 4 |
| 并发 Judge | 3 |
| 每案例 Judge 数 | 3 |
| 最低 Judge 置信度 | 0.80 |
| 所需 Judge 一致数 | 2 |
| Live 重复运行数 | 3 |

### Standard Profile

| 项目 | 限制 |
|------|------|
| 最大轮数 | 5 |
| 最大模型调用数 | 200 |
| 最大运行时间 | 120 分钟 |
| 并发 Game Agent | 6 |
| 并发 Judge | 4 |

---

## 停止条件

### 成功停止

- 确定性测试通过率 100%
- 新增回归测试全部通过
- 正向保活测试全部通过
- Required E2E 和 Build 全部通过
- Live 模型覆盖率达到阈值
- Critical 问题为 0
- Major 问题为 0
- 核心玩法合法性 ≥ 95%
- NPC 事实和认知边界严重违规为 0
- State/Narrative 严重冲突为 0
- 平均 Judge 综合分 ≥ 4.2/5
- 核心指标相对 Baseline 未退化超过 2pp

### 停止并标记 blocked

- 达到最大轮数
- 连续 2 轮核心分数没有改善
- 同一缺陷连续 2 次修复失败
- Judge 严重分歧且无法确定性复现
- 缺少真实模型凭证
- 外部网关不可用
- 需要产品规则决策
- 修复会破坏不可变契约

---

## 安全边界

- 自动修复仅适用于有充分证据的缺陷（≥2 个独立 Judge 一致，置信度 ≥ 0.80）
- 确定性 Oracle 未复现的问题不进入自动修复
- 以下情况标记为 `human_review_required`：
  - Judge 之间严重冲突
  - 只有审美偏好，无玩法不变量
  - 无法构造确定性复现
  - 缺少必要世界规则
  - 需要产品决策
  - 可能扩大权限或降低安全边界
- 所有修复必须测试优先（先写失败测试，再修代码）
- 禁止：删除测试、降低断言强度、修改预期值来匹配错误实现、针对 caseId 写分支

---

## 如何查看运行产物

每次运行在 `.runtime-data/self-improve/<runId>/` 下生成以下产物：

| 文件 | 说明 |
|------|------|
| `manifest.json` | 运行元数据（状态、轮数、Profile） |
| `state.json` | 完整状态机快照（可恢复） |
| `traces.jsonl` | 每行一个执行轨迹 JSON |
| `deterministic-results.json` | 确定性 Oracle 检查结果 |
| `final-report.json` | 最终报告（JSON） |
| `final-report.md` | 最终报告（Markdown） |

查看运行报告：
```bash
pnpm self-improve:report -- --run-id <runId>
```

---

## 如何恢复未完成运行

```bash
pnpm self-improve:resume -- --run-id <runId>
```

恢复后系统从上次保存的阶段继续执行，不重复已完成的工作。

---

## 新增文件清单

```
src/lib/evals/selfImprove/
  types.ts              — 核心类型定义
  config.ts             — 配置与环境变量解析
  schemas.ts            — 运行时 Schema 校验
  stateMachine.ts       — 状态机（阶段转换、持久化、恢复）
  budget.ts             — 预算追踪
  stopPolicy.ts         — 停止条件评估
  scenarioPool.ts       — 场景池管理
  traceStore.ts         — 执行轨迹持久化
  gameRunner.ts         — 游戏回合执行器
  judgeEnsemble.ts      — 专业 Judge 集合
  defectTriage.ts       — 缺陷分诊与仲裁
  repairPlan.ts         — 修复方案生成
  qualityGate.ts        — 质量门禁
  orchestrator.ts       — 主协调器
  stateMachine.test.ts  — 状态机单元测试（19 个）

scripts/self-improve/
  run.ts                — 主运行脚本
  baseline.ts           — 基线建立脚本
  report.ts             — 报告查看脚本
  resume.ts             — 恢复运行脚本

benchmarks/self-improve/
  smoke-cases.json      — Smoke 场景定义
  regression-cases.json — 回归案例累积库

docs/
  self-improving-agent-system.md  — 完整实现规范
  self-improve-readme.md          — 本文件
```
