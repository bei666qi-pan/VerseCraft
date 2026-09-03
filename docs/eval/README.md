# VerseCraft 评测体系

> 本文档是 VerseCraft 统一评测体系的入口。面向：开发者、评测工程师、AI 行为审核者。

---

## 1. 体系分层

```text
PR 层（每个 PR 自动运行，目标 <20min）
├── L1+L2: lint + unit tests (test:ci → pnpm test:ci)
├── L3: deterministic assertions (pnpm test:promptfoo)
├── L3: playthrough simulator (pnpm test:playthrough)
├── L3: E2E contract (pnpm test:e2e:contract)
├── L5+L6: offline evals fast (detectors + narrative-style)
└── Docker build (docker build)

夜间/手动层（schedule/dispatch）
├── 全部 PR 层
├── Mock server 全量 (benchmark:chat:mock + eval:chat-quality:mock +
│   eval:narrative-safety:mock + eval:npc-consistency:mock)
├── Narrative safety mock gate（10 维度全部 1.000 断言）
└── Live small sample (live-chat-perf + schedule 含 live eval；可额外运行 model narrative review)

本地开发层（开发者手动运行）
├── test:gate / test:gate:quick / test:gate:ci
├── eval:authenticity / eval:player-echo / eval:director
├── eval:social-world / eval:deepeval
├── benchmark:game-mechanics / benchmark:world-retrieval
└── benchmark:human-eval:ab / benchmark:human-eval:likert
```

---

## 2. 评测命令速查

### 基础验证

| 命令 | 用途 | 耗时 |
|---|---|---|
| `pnpm test:unit` | 全部单测（2551+） | ~13s |
| `pnpm test:ci` | lint + unit + db check + build | ~120s |
| `pnpm test:promptfoo` | 确定性契约断言（172 条） | ~2s |
| `pnpm test:playthrough` | 长程 playthrough 模拟器 | ~1s |
| `pnpm test:e2e:contract` | E2E SSE contract + latency + opening | ~30s |
| `pnpm test:e2e:mock` | E2E SSE contract（mock 模式） | ~15s |
| `npx eslint .` | ESLint 检查 | ~10s |

### Mock 评测

| 命令 | 用途 | 耗时 |
|---|---|---|
| `pnpm eval:chat-quality:mock` | 当前回合契约与叙事锚点（10 个确定性 mock） | ~5s |
| `pnpm eval:narrative-safety:mock` | 安全合规（mock） | ~30s |
| `pnpm eval:npc-consistency:mock` | NPC 一致性（mock） | ~5s |
| `pnpm eval:narrative-style:mock` | 叙事风格（mock，硬门） | ~2s |
| `pnpm eval:detectors:mock` | 检测器（mock） | ~1s |
| `pnpm benchmark:chat:mock` | 延迟预算（mock，需 mock server） | ~10s |

### Live 评测（需 AI gateway）

| 命令 | 用途 |
|---|---|
| `pnpm verify:ai-gateway` | 前置条件检查 |
| `pnpm eval:chat-quality -- --mode live` | 叙事质量（live） |
| `pnpm eval:narrative-safety -- --mode live` | 安全合规（live） |
| `pnpm eval:narrative-style:live` | 叙事风格（live） |
| `pnpm benchmark:chat-metrics` | 延迟基准（live） |
| `pnpm eval:model-narrative-review:live` | 以 `EVAL_JUDGE` gateway 审查真实轨迹中的幻觉、认知边界与可玩性；需显式开关 |

### 特殊工具

| 命令 | 用途 |
|---|---|
| `pnpm eval:authenticity` | 真实性评测（需人工判断） |
| `pnpm eval:player-echo` | 玩家回声评测 |
| `pnpm eval:director` | 离线 reasoner 路由评测 |
| `pnpm eval:social-world` | 社交世界评测 |
| `pnpm eval:deepeval` | 外部 deepeval 集成 |
| `pnpm test:gate` | 本地回归门禁 |
| `pnpm benchmark:run` | 旧版 benchmark（已漂移，建议用 harness 替代） |

---

## 3. 数据集

| 路径 | 用途 | 数量 |
|---|---|---|
| `benchmarks/chat-turns/*.json` | 当前回合 mock 契约 | 10 |
| `benchmarks/llm-evals/cases.json` | 真实模型广场景叙事质量 | 121 |
| `benchmarks/narrative-safety/cases.json` | 安全合规场景 | 1380 行 |
| `benchmarks/narrative-style/cases.json` | 叙事风格场景 | 86 |
| `benchmarks/task-eval/scenarios.json` | 任务系统场景 | 30 |
| `benchmarks/game-mechanics/scenarios.json` | 游戏机制场景 | 13 |
| `benchmarks/redTeam/generated-attacks.json` | Red team 攻击 | ~60 |

### 加 case 规范

1. 每个 case 需有唯一 `id`（kebab-case）
2. 包含 `initialState` / `playerActions` / `expectedOutcomes`
3. `OutcomeType` 必须（新类型 → 同步更新 `types.ts` 联合类型 + `taskEvaluator.ts` 分支）
4. 优先放离线可判定的 outcome（状态变化类），叙事质量类 defer 给 live judge
5. 加完后跑 `pnpm dlx tsx --test src/lib/evals/taskEval/taskEval.test.ts`

---

## 4. Judge 系统

- 路径：`src/lib/evals/judge/`
- 离线模式：纯函数确定性评估（`evaluateTaskScenarioOffline`）
- Live 模式：通过 harness 调用 AI judge（`JudgeService`）
- 校准种子：40 种子 × 3 裁判 × ≤3 轮 prompt 迭代
- 缓存：按 (caseId, contentHash) 缓存结果
- 预算防御：单日 ≤2000 次 live 调用（`budgetGuard.ts`）

### 证据边界（重要）

- mock、关键词断言和离线 heuristic 只证明测试夹具、协议与确定性 guard 没有回归；它们**不是**真实模型的叙事质量或可玩性证据。
- `eval:model-narrative-review:live` 复用 `EVAL_JUDGE` logical task 和 AI gateway，对完成的真实 `/api/chat` trace 做独立审查。默认关闭，只有同时传入 `--mode live` 和 `VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS=1` 才发送模型请求。
- live 审查失败、预算耗尽、响应 JSON 无效、低置信或 critical/major 问题缺少玩家可见证据时，结果为 `inconclusive`，绝不会回退为“启发式通过”。报告会显示 live coverage、每个不可判定原因、content hash、模型/provider 与带 step 的 issue evidence。
- 对真实游玩结果，先用 `pnpm eval:playthrough:live:smoke` 生成 trace，再运行：

  ```bash
  VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS=1 \
    pnpm eval:model-narrative-review -- --mode live \
    --input .runtime-data/eval/playthrough-live-smoke/traces/<trace>.json \
    --assert-live-coverage --json-out .runtime-data/model-review.json \
    --markdown-out .runtime-data/model-review.md
  ```

  `benchmarks/model-narrative-review/cases.json` 是校准/对抗 fixture，不应被报告为真实玩家回合。

### 离线处理规则

- 简单状态变化（`item_acquired`、`originium_changed`、`task_status` 等）：精确比较 expected vs actual
- 复杂叙事质量（`narrative_tension`、`moral_dilemma` 等）：离线返回 `true`（乐观），live judge 精确评估
- NPC 检测：通过 `KNOWN_NPC_NAMES` 表将 display name 映射到 npcId

---

## 5. 趋势与历史

- 每次评测运行追加到 `.runtime-data/eval/history/<suite>.jsonl`（一行一条 JSON 记录，Git 忽略）
- CI artifact 保留命名 artifact，30 天
- 需要保留的基线由 CI artifact 或发布说明固化，不在源码仓库累积生成报告
- 本地运行记录到 `.runtime-data/`（gitignored）
- 如需跨运行趋势比较：`pnpm benchmark:diff`（指向旧 baseline）

---

## 6. CI 门禁概览

### PR 硬门

| 门禁 | 命令 | 失败阻断 |
|---|---|---|
| Lint | `npx eslint` | ✅ |
| Unit tests | `pnpm test:unit` | ✅ |
| Build | `pnpm build` | ✅（optional，晚于其它） |
| Deterministic assertions | `pnpm test:promptfoo` | ✅ |
| Playthrough mock | `pnpm test:playthrough` | ✅ |
| E2E contract | `pnpm test:e2e:contract` | ✅ |
| Detectors | `pnpm eval:detectors:mock` | ✅ |
| Narrative style | `pnpm eval:narrative-style:mock` | ✅ |
| Docker build | `docker build` | ✅ |

### 夜间软门

| 门禁 | 命令 |
|---|---|
| Narrative safety 10 维度 | `eval:narrative-safety:mock` 断言全部 1.000 |
| Chat quality | `eval:chat-quality:mock` |
| NPC consistency | `eval:npc-consistency:mock` |
| Latency budget | `benchmark:chat:mock` |

---

## 7. 常见问题

**Q: 加了一个新 case，通过率为什么低了？**
A: 检查 `OutcomeType` 是否加了新值却未更新 `taskEvaluator.ts` 的 `getActualValue`。这是最常见的故障模式。

**Q: Mock 和 Live 分数差距大？**
A: 正常。Mock 对复杂叙事质量类乐观返回 `true`，live judge 才会严格评估。

**Q: 如何加大型评测？**
A: 遵循 Phase 3 模式：扩展数据集 → 更新 types → 更新 evaluator → 加 regression case → 验证门禁。
---

## 8. 意图锚定的可玩性评测

`eval:intent-grounded-playability` 不用 mock 猜自然语言。它先让真实 `PLAYER_CONTROL_PREFLIGHT` 为每条中文表达生成候选控制面，再由带场景事实、允许 / 禁止 slot 与状态不变量的确定性 oracle 审核候选。fast path、缓存、网关失败、解析失败和未启用 live 都是 `inconclusive`，严格 gate 绝不会把它们当作通过。

```bash
# 只检查 corpus 和报告结构；不会证明可玩性，也不会调用模型
pnpm eval:intent-grounded-playability -- --mode mock

# 真实 one-api 模型矩阵；require_model 会跳过 control fast path 和 cache
VERSECRAFT_ENABLE_INTENT_GROUNDED_PLAYABILITY_EVALS=1 \
pnpm eval:intent-grounded-playability -- --mode live --assert-strict \
  --json-out .runtime-data/intent-grounded-playability.json \
  --markdown-out .runtime-data/intent-grounded-playability.md
```

可选 `--trace <actual-api-chat-trace.json>` 会把和 corpus 表达精确匹配的真实 `/api/chat` 回合交给现有 model narrative review，并把两类证据关联。没有匹配场景事实、SSE final 或 live narrative review 的 trace 不能计为端到端通过。

报告中的 Wilson 区间仅描述固定语料上的观察结果；它不外推为“任意世界状态、任意模型版本、任意自然语言均已证明可玩”。语料当前覆盖探索、调查、对话、道具、战斗、否定、歧义、注入和 root-truth 越权；新增玩法或事实边界时必须先扩展语料和 oracle，再宣称覆盖。
