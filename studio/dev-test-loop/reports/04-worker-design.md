# VCDT-D04 统一 Worker 工作流设计

> Design date: 2026-07-24 | Designer: Lead Orchestrator
> Scope: 单 AI 状态机、模式切换、失败回环、完成定义、证据报告

## 1. 状态机设计

### 1.1 完整状态图

```
                    ┌──────────┐
                    │UNDERSTAND│◄────────────────────────────────────┐
                    └────┬─────┘                                     │
                         │                                           │
                    ┌────▼─────┐                                     │
                    │ BASELINE  │                                     │
                    └────┬─────┘                                     │
                         │                                           │
              ┌──────────▼──────────┐                                │
              │  REPRODUCE / RED    │                                │
              └──────────┬─────────┘                                │
                         │                                           │
                    ┌────▼─────┐                                     │
                    │IMPLEMENT │◄──────────────────────┐             │
                    └────┬─────┘                       │             │
                         │                             │             │
                    ┌────▼─────┐   失败                 │             │
                    │FOCUSED   │───────► IMPLEMENT ─────┤             │
                    │ TEST     │                       │             │
                    └────┬─────┘                       │             │
                         │ 通过                         │             │
                    ┌────▼─────┐   失败                 │             │
                    │ADVERSARIAL│──────► IMPLEMENT ─────┤             │
                    │ TEST     │                       │             │
                    └────┬─────┘                       │             │
                         │ 通过                         │             │
                    ┌────▼─────┐   失败                 │             │
                    │ APP TEST │──────► IMPLEMENT ──────┤             │
                    └────┬─────┘                       │             │
                         │ 通过                         │             │
                    ┌────▼─────┐   发现新问题            │             │
                    │REGRESSION│──────► IMPLEMENT ──────┘             │
                    └────┬─────┘                                      │
                         │ 全部通过                                    │
                    ┌────▼─────┐                                      │
                    │ HANDOFF  │                                      │
                    └──────────┘                                      │
                         │                                             │
                    环境阻塞                                           │
                    ┌────▼─────┐                                      │
                    │ BLOCKED  │── 外部条件满足后 ──► REPRODUCE/RED ──┘
                    └──────────┘
```

### 1.2 状态定义

| 状态 | 触发条件 | 输出 | 超时 |
|------|----------|------|------|
| **UNDERSTAND** | 任务开始 | 模块理解笔记、验收标准清单 | 无 |
| **BASELINE** | UNDERSTAND 完成 | git 状态、现有测试基线、环境能力 | 5min |
| **REPRODUCE/RED** | BASELINE 完成 | 失败复现步骤 / 先红测试用例 | 10min |
| **IMPLEMENT** | RED 完成 / 测试失败后 | 生产代码修改 + 测试代码修改 | 按任务 |
| **FOCUSED TEST** | IMPLEMENT 完成 | 最小测试结果 + 退出码 | 2min |
| **ADVERSARIAL TEST** | FOCUSED 通过 | 反例/边界/恢复测试结果 | 5min |
| **APP TEST** | ADVERSARIAL 通过 | 浏览器/API 验证证据 | 10min |
| **REGRESSION** | APP TEST 通过 | 风险级回归矩阵结果 | 10min |
| **HANDOFF** | 全部通过 | Handoff 报告 | 5min |
| **BLOCKED** | 环境阻塞×3 | 阻塞证据 + 用户下一步 | — |

### 1.3 失败回环规则

```
FOCUSED TEST 失败
  → 自动回到 IMPLEMENT
  → 修复后重新 FOCUSED TEST
  → 循环上限: 5 次
  → 超过上限: 进入 HANDOFF (标记为 blocked_by_complexity)

ADVERSARIAL TEST 失败
  → 如果在 IMPLEMENT 能力范围内: 回到 IMPLEMENT
  → 如果是新增边界场景的旧 bug: 记录为已知限制，继续
  → 如果是需求/contract 冲突: 回到 UNDERSTAND

APP TEST 失败
  → 如果在 IMPLEMENT 能力范围内: 回到 IMPLEMENT
  → 如果是环境问题: 对照测试确认，进入 BLOCKED
  → 如果是产品级问题: 记录并继续（不阻塞交付）

REGRESSION 失败
  → 区分: 本次改动引入 vs 既有失败
  → 本次改动引入: 回到 IMPLEMENT
  → 既有失败: 记录为已知限制，继续
```

## 2. 模式切换机制

### 2.1 两种姿态

| 姿态 | 行为 | 触发 |
|------|------|------|
| **Dev 姿态** | 写代码、改实现、重构 | IMPLEMENT 状态 |
| **Test 姿态** | 不写生产代码、审查 diff、找失败 | 所有 TEST 状态 |

### 2.2 姿态切换的强制执行

Worker 在进入 Test 状态时必须执行"姿态切换清单"：

```markdown
## Test 姿态切换清单

- [ ] 停止修改生产代码
- [ ] 重新阅读验收标准和 contract
- [ ] 将当前 diff 视为第三方提交
- [ ] 从 contract 推导预期（不从实现倒推）
- [ ] 优先寻找失败路径（不先验证 happy path）
- [ ] UI 测试: 承诺只通过页面可见状态操作
- [ ] 准备记录: 测试命令、退出码、断言数量
```

### 2.3 模式切换的实现

在 Worker 提示词中通过以下机制实现：

1. **状态追踪**：Worker 在每步操作后更新自己的状态（通过 handoff 协议）
2. **姿态标记**：在进入 Test 状态时，Worker 显式标记 `posture: "test"`
3. **自我审查**：Test 状态下，Worker 被要求对每个断言解释"这个断言为什么不是恒真"

## 3. 自动测试范围选择

### 3.1 Diff→风险→测试 路由

```
输入: git diff --name-only
  ↓
映射到风险级别 (见 RISK_MATRIX.md)
  ↓
选择 focused test 集合
  ↓
执行 focused → 通过后选择 adversarial
  ↓
通过后选择 app test
  ↓
通过后选择 regression
```

### 3.2 路由规则

| 修改路径模式 | Risk | Focused | Adversarial | App Test | Regression |
|-------------|------|---------|-------------|----------|------------|
| `docs/**` | L0 | — | — | — | — |
| `src/lib/turnEngine/*` | L3 | `*.test.ts` | 反例+边界 | `chat-sse-contract.spec.ts` | contract + e2e + mock eval |
| `src/store/*` | L2 | 相关 unit | 边界状态 | `play.spec.ts` | full e2e mobile |
| `src/app/api/chat/*` | L3 | `route.*.test.ts` | 降级+错误 | SSE contract e2e | benchmark:chat:mock |
| `src/lib/ai/*` | L2 | `*.test.ts` | fallback | gateway probe | — |
| `src/db/*` | L3 | schema check | 迁移 | — | db:check |
| `e2e/**` | L2 | 自身 | — | 自身 | — |

### 3.3 Budget Cap

每个测试阶段有预算上限：

| 阶段 | 预算 | 超预算行为 |
|------|------|-----------|
| FOCUSED | 2min | 只跑最相关的 3 个 test 文件 |
| ADVERSARIAL | 5min | 优先跑一个反例+一个边界 |
| APP TEST | 10min | 优先一个用户路径 |
| REGRESSION | 10min | 按风险从高到低跑 |

## 4. 完成定义强制

### 4.1 不可跳过的检查

Worker 在进入 HANDOFF 前必须逐条确认：

```
□ 1. 验收标准逐条有证据（测试输出/截图/退出码）
□ 2. 生产改动与测试改动由同一 task 完成
□ 3. focused + adversarial + app + regression 中适用项已执行
□ 4. 真实退出码和失败信息已检查
□ 5. 没有通过删测、降断言、fallback 及格制造绿色
□ 6. 用户修改和范围外文件未被覆盖
□ 7. handoff 写明测试命令、退出码、证据、未执行项、风险、回滚
```

### 4.2 禁止结束语检测

如果 Worker 的 handoff 包含以下任何短语，handoff 无效：

- "代码已实现，建议 QA 测试"
- "测试可以后续补"
- "浏览器验证留给另一个 Agent"
- "mock 通过，因此真实 AI 质量提升"
- "从代码看应该没问题"
- "开发已完成，等待测试 task"
- "代码看起来正确"

## 5. 证据报告格式

### 5.1 统一 Handoff 模板

```json
{
  "taskId": "VCDT-XXX",
  "objective": "...",
  "riskLevel": "L3",
  "inputCommit": "abc123",
  "states": [
    {"state": "UNDERSTAND", "duration": "2min", "output": "..."},
    {"state": "BASELINE", "duration": "1min", "output": "..."},
    {"state": "REPRODUCE/RED", "duration": "5min", "output": "..."},
    {"state": "IMPLEMENT", "duration": "15min", "output": "..."},
    {"state": "FOCUSED_TEST", "duration": "1min", "exitCode": 0, "assertions": 12},
    {"state": "ADVERSARIAL_TEST", "duration": "3min", "exitCode": 0, "assertions": 8},
    {"state": "APP_TEST", "duration": "5min", "screenshot": "path/to/screenshot.png"},
    {"state": "REGRESSION", "duration": "8min", "exitCode": 0},
    {"state": "HANDOFF", "duration": "2min"}
  ],
  "verdict": "pass",
  "knownLimitations": [],
  "rollback": "git revert <commit>",
  "timestamp": "2026-07-24T..."
}
```

### 5.2 证据分级

| 证据类型 | 强度 | 适用场景 |
|----------|------|----------|
| 测试退出码 = 0 | 强 | 所有 |
| 测试断言数量 >= N | 中 | unit/contract |
| 浏览器截图 | 中 | UI |
| API 响应 JSON | 强 | SSE/API |
| Mock eval 分数 | 弱 | 仅契约信号 |
| Live eval 分数 (校准 judge) | 中 | 质量判定 |
| Human review | 最强 | 发布门 |

## 6. 统一 Worker 提示词修订建议

### 6.1 对 `01-UNIFIED-WORKER.md` 的修订

当前版本已经很好，建议增加：

1. **自动测试范围选择器**：在 UNDERSTAND 之后，增加一个自动步骤：
   ```
   4. SCOPE — 根据 git diff 自动推断 focused/adversarial/app/regression 测试范围
   ```

2. **姿态切换清单**：在进入每个 TEST 阶段时强制执行
   ```
   在进入 FOCUSED TEST / ADVERSARIAL TEST / APP TEST 前，必须执行姿态切换清单
   ```

3. **预算超限处理**：每个阶段增加超时预算
   ```
   FOCUSED: 2min / ADVERSARIAL: 5min / APP: 10min / REGRESSION: 10min
   ```

4. **禁止结束语检测**：增加自动检测规则
   ```
   在 HANDOFF 中不得出现"建议 QA 测试""测试后续补"等短语
   ```

5. **循环上限**：增加循环退出条件
   ```
   同一 IMPLEMENT→TEST→IMPLEMENT 循环最多 5 次
   ```

### 6.2 新增章节建议

在 `01-UNIFIED-WORKER.md` 增加：

```markdown
## 0. 自动测试范围推断

在 UNDERSTAND 阶段完成后，运行:

```bash
git diff --name-only HEAD
```

根据修改路径自动推断风险级别和测试范围。输出:

- 风险级别: L0-L4
- Focused 测试: [文件列表]
- Adversarial 场景: [反例/边界/恢复]
- App Test: [浏览器路径/API 端点]
- Regression: [回归矩阵]
```

## 7. 与现有 AgentContext 的整合

### 7.1 当前 `src/lib/ai/agentContext.ts`

已有：`AgentMode`, `TestScope`, `AgentTestReport`, `inferTestScope()`

### 7.2 需要新增

```typescript
// 状态机
type WorkerState =
  | "UNDERSTAND" | "BASELINE" | "REPRODUCE"
  | "IMPLEMENT" | "FOCUSED_TEST" | "ADVERSARIAL_TEST"
  | "APP_TEST" | "REGRESSION" | "HANDOFF" | "BLOCKED";

// 姿态
type WorkerPosture = "dev" | "test";

// 状态转换
interface StateTransition {
  from: WorkerState;
  to: WorkerState;
  condition: string;
  autoAdvance: boolean;
}

// 测试预算
interface TestBudget {
  focusedMs: number;
  adversarialMs: number;
  appTestMs: number;
  regressionMs: number;
}
```
