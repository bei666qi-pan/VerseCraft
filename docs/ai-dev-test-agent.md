# VerseCraft 统一开发测试 Agent 规范

## 1. 核心理念

**同一个 AI 既负责开发代码，又负责测试应用。**

不是两个 Agent 分工，而是同一个 Agent 在 dev 模式和 test 模式之间切换。
开发完成后，Agent 立即以 test 模式验证自己的改动，形成 `修改→测试→报告` 闭环。

## 2. Agent 双模行为契约

### 2.1 Dev 模式

| 行为 | 规范 |
|------|------|
| 代码修改 | 遵循 `AGENTS.md` 全部约束 |
| 范围 | 限定在用户指定的模块/文件 |
| 提交前 | 必须通过 `npx eslint .` + `pnpm test:unit` |
| 不可破坏 | `/api/chat` SSE、`useGameStore`、`schema.ts`、生产 prompt |

### 2.2 Test 模式

| 行为 | 规范 |
|------|------|
| 测试范围 | 自动检测 diff 波及的模块，运行对应的 test suite |
| Mock 优先 | 默认使用 `AI_PROVIDER=mock` 跑契约硬门 |
| Live 仅校准后 | live judge 必须经 gold set 校准（Spearman >= 0.7）才能用于质量判定 |
| 报告格式 | 统一的 `diff→test→score` JSON 报告 |

### 2.3 模式切换规则

- Dev 模式修改代码后，**自动进入** test 模式
- Test 模式发现问题后，**自动进入** dev 模式修复
- 循环直到 test 模式全部通过
- 不可跳过的硬门：eslint、test:unit、build

## 3. Agent 上下文 (`AgentContext`)

```ts
interface AgentContext {
  mode: "dev" | "test";
  /** 当前实验溯源 */
  provenance: ExperimentProvenance;
  /** 受影响的模块列表 */
  affectedModules: string[];
  /** 自动检测的测试范围 */
  testScope: {
    unit: string[];      // unit test 文件路径
    contract: string[];  // contract test 文件路径
    e2e: string[];       // e2e spec 文件路径
    eval: string[];      // eval 维度
    benchmark: string[]; // benchmark 维度
  };
  /** 最近一次修改的 diff */
  lastDiff?: {
    files: string[];
    summary: string;
  };
  /** 最近一次测试报告 */
  lastTestReport?: TestReport;
}
```

## 4. 测试范围自动检测

Agent 根据修改的文件路径，自动推断需要运行的测试：

| 修改区域 | 自动触发的测试 |
|----------|---------------|
| `src/lib/turnEngine/*` | `src/lib/turnEngine/*.test.ts` + contract tests |
| `src/lib/playRealtime/*` | contract tests + mock benchmark |
| `src/lib/evals/*` | 相关 eval suite (mock mode) |
| `src/app/api/chat/*` | contract tests + e2e:contract + mock benchmark |
| `src/store/*` | unit tests + e2e:play |
| `src/db/*` | unit tests + schema check |
| `src/lib/ai/*` | unit tests + ai-gateway probe |

## 5. 测试报告格式

```json
{
  "agentId": "kimi-code-cli",
  "mode": "test",
  "provenance": { "...": "ExperimentProvenance" },
  "diff": {
    "files": ["src/lib/turnEngine/normalizePlayerInput.ts"],
    "summary": "修复输入归一化中的空字符串处理"
  },
  "tests": {
    "unit": { "total": 10, "pass": 10, "fail": 0 },
    "contract": { "total": 5, "pass": 5, "fail": 0 },
    "lint": { "errors": 0, "warnings": 0 }
  },
  "evals": {
    "mock": {
      "chat-quality": { "passRate": 0.95, "gate": "pass" },
      "narrative-safety": { "passRate": 0.98, "gate": "pass" }
    }
  },
  "verdict": "pass",
  "timestamp": "2026-07-23T06:00:00.000Z"
}
```

## 6. 禁止行为

- **禁止** dev 模式下跳过 eslint/test:unit 直接认为完成
- **禁止** test 模式下使用未经校准的 live judge 做质量判定
- **禁止** mock 模式结果用于"叙事更好""更好玩"判定
- **禁止** 用外部 API 做测试（同一个 AI 自己写测试代码）
- **禁止** 修改测试让失败的用例通过（只能修代码或修 buggy 的测试断言）

## 7. 闭环验证流程

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│  Dev    │────▶│  Lint   │────▶│  Unit   │────▶│  Build   │
│  (修改)  │     │  +Fix   │     │  Tests  │     │          │
└─────────┘     └─────────┘     └─────────┘     └──────────┘
                                                        │
                                            ┌───────────┘
                                            ▼
                                      ┌──────────┐     ┌──────────┐
                                      │  Mock    │────▶│  Report  │
                                      │  Evals   │     │  (pass/  │
                                      └──────────┘     │   fail)  │
                                                       └──────────┘
```

对于 `/api/chat` 周边修改，额外增加：

```
Mock Evals ──▶ Mock Playthrough ──▶ Benchmark ──▶ Contract Test ──▶ Report
```

## 8. 与现有基础设施的关系

- 复用 `src/lib/evals/harness/` 作为统一评测入口
- 复用 `benchmarks/` 各 suite 的数据集和 rubric
- 复用 `src/lib/evals/playthrough/` 进行整局模拟
- 复用 `src/lib/ai/mock/` 进行 mock 测试
- 新增 `src/lib/ai/agentContext.ts` 管理 Agent 上下文

## 9. 实验溯源要求

每次 Agent test 运行必须记录：

- `commit` — 当前 git SHA
- `promptVersion` — `VERSECRAFT_DM_STABLE_PROMPT_VERSION`
- `model` — `AI_MODEL_CHAT`
- `config` — `VERSECRAFT_EVAL_CONFIG`
- `datasetVersion` — `VERSECRAFT_EVAL_DATASET_VERSION`
- `seed` — `VERSECRAFT_EVAL_SEED`
- `judgeProvenance` — judge 模型 + rubric 版本

这些字段由 `resolveExperimentProvenance()` 自动填充。
