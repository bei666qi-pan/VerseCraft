# Playthrough Harness v3 架构

> 自建薄壳长程 playthrough 模拟器 — 把 AI 游戏当作「有状态系统」做模糊测试

## 为什么自建

行业经验：通用工具（Promptfoo、DeepEval）擅长**单点断言**和**对话质量打分**，但缺乏以下能力：

| 能力 | 通用工具 | 自建 harness |
|------|---------|-------------|
| 跨多步状态不变量检查 | ❌ | ✅ 每步硬断言 |
| 模拟玩家行为分布 | 弱（persona prompt 一次） | ✅ 多 persona × 多场景 × 多 seed |
| 整局叙事一致性 | 弱（只评单轮） | ✅ 整局 transcript 评 |
| 失败聚类（识别反复出现的 bug 模式） | ❌ | ✅ 按 (invariant, scenario, persona) 聚类 |
| Trace artifact 落盘 | 弱 | ✅ 每局写 JSON |

**结论**：Promptfoo 做武器/职业 schema 校验；DeepEval 做叙事打分；**自建 harness 做整局模拟 + 双层检查器**。

## 整体架构

```text
                  ┌─────────────────────────────────────────────┐
                  │       Playthrough Harness v3                 │
                  └─────────────────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
   ┌────▼─────────┐         ┌────────▼─────────┐         ┌────────▼────────┐
   │ Player Agent │         │   Game Loop      │         │  Checker        │
   │ 4 persona    │         │   SUT Adapter    │         │  双层            │
   │  speedrunner │         │  ┌────────────┐  │         │  L1 不变量       │
   │  explorer    │  ─────▶ │  │  MockSut   │  │ ─────▶  │  L2 叙事裁判     │
   │  rulebreaker │         │  │  HttpSut   │  │         │  TraceArtifact   │
   │  confused    │         │  └────────────┘  │         │  失败聚类         │
   └──────────────┘         └──────────────────┘         └─────────────────┘
                                                                  │
                                                                  ▼
                                                       ┌─────────────────────┐
                                                       │  Orchestrator       │
                                                       │  runPlaythroughBatchV3│
                                                       │  跨场景 × persona    │
                                                       │  × runs              │
                                                       └─────────────────────┘
```

## 模块拆分

### ① Player Agent（`src/lib/evals/playthrough/playerAgent.ts`）

四种 persona：

| Persona | 行为 | 用途 |
|---------|------|------|
| speedrunner | 奔主线 | 测最低阻力路径、典型通关流 |
| explorer | 探索分支 | 测支线、图鉴、任务、对话 |
| rulebreaker | 攻击 NPC、刷物品、prompt injection | 测安全、规则拒绝 |
| confused | 输入 "嗯"、"我迷路了" | 测鲁棒性、错误恢复 |

Mock 模式：基于规则的伪随机动作生成；live 模式：用 LLM 按 persona prompt 生成下一步行动。

### ② SUT Adapter（`src/lib/evals/playthrough/sutAdapter.ts`）

两个实现：

- **`MockSutAdapter`**：规则模拟 + 状态机，不调外部 API
- **`HttpSutAdapter`**：调真实 `/api/chat`，解析 SSE 流，提取 `__VERSECRAFT_FINAL__:<json>` 帧

降级链：`HttpSutAdapter` 网络失败 → 自动降级到 `MockSutAdapter`。

### ③ Game Loop

```text
state ← initial()
for step in range(MAX_STEPS):
  action ← player_agent.act(persona, transcript, state)
  response ← sut.step(action)
  state ← apply(response)
  invariants ← check_all_invariants(state, narrative)  # L1
  if invariants.failed:
    record_failure(step, invariants)
    break
  if is_softlocked(transcript):  # 连续 N 步无进展
    record_termination("softlock")
    break
  if state.is_death or state.reached_ending:
    record_termination(death|ending)
    break
judge ← judge_narrative(transcript)  # L2
write_trace_artifact()
```

### ④ 双层 Checker

**L1 不变量**（每步硬断言）：

| 类别 | 规则 |
|------|------|
| 数值约束 | HP ≥ 0、sanity ≥ 0、originium ≥ 0 |
| 范围 | 武器 stability ∈ [0,100]，contamination ∈ [0,100] |
| 容量 | 行囊 ≤ 最大槽位 |
| 单步限制 | currency_change ≤ 50、awarded_items ≤ 5、consumed_items ≤ 10 |
| 状态跳变 | 单步 HP 变化 >30 视为跳变、理智变化 >25 |
| 位置合法 | 不能从 B1 跳到 4F 无交代 |
| NPC 一致性 | 已死 NPC 不能复活（`detectNpcResurrections`） |
| 任务单调性 | 已完成任务不能回退 |
| DM-only 泄漏 | narrative 不能包含 system prompt、JSON 格式、DM指令 |

**L2 叙事裁判**（整局一评）：

5 维度（coherence / characterVoice / plotLogic / immersion / factConsistency）+ hard floor（详见 `src/lib/evals/deepEval/metrics.ts`）。

mock 模式：基于规则的启发式评分（关键词命中 + 长度）；live 模式：调真实 LLM judge。

### ⑤ Scenario Library（`src/lib/evals/playthrough/scenarios.ts`）

**20 个场景 × 4 路径**：

| 路径 | 场景数 | 用途 |
|------|--------|------|
| happy | 5 | 正常通关、经济流通、NPC 交互 |
| recovery | 5 | 低 HP/低 sanity 后能否恢复、库存满后能否处理 |
| refusal | 5 | 攻击友好 NPC、prompt injection、非法物品、跨职业 |
| abandonment | 5 | 玩家弃坑、卡死循环、低理智崩溃 |

每个场景挂若干 persona，每个 persona 跑 N 局，scenario 定义了 `expectedTerminations` 和 `criticalInvariants`。

### ⑥ Orchestrator（`src/lib/evals/playthrough/orchestrator.ts`）

```text
runPlaythroughBatchV3(config):
  for scenario in SCENARIOS.filter(config.scenarioCategories):
    for persona in scenario.personas:
      for seed in range(config.runsPerPersona):
        sut.reset()
        result ← runSinglePlaythroughV3(config, scenario, persona, seed, sut)
        collect_trace(result)
        collect_failures(result)
  cluster_failures(allResults)  # 跨 run 失败聚类
  write_summary()
```

### ⑦ Trace Artifact

每局写一份 JSON 到 `.runtime-data/fuzz-traces/<scenario>-<persona>-seed<N>.json`：

```jsonc
{
  "runId": "happy-speedrun-speedrunner-seed42",
  "scenarioId": "happy-speedrun",
  "scenarioCategory": "happy",
  "persona": "speedrunner",
  "seed": 42,
  "startedAt": "2026-07-07T03:00:01.234Z",
  "finishedAt": "2026-07-07T03:00:03.456Z",
  "durationMs": 2222,
  "terminatedReason": "max_steps",
  "totalSteps": 20,
  "passed": true,
  "failureSummary": null,
  "transcript": [...],  // 每步的 action + narrative + state delta
  "invariantResults": [...],
  "narrativeConsistency": {...}
}
```

### ⑧ 失败聚类（`clusterFailures`）

按 (invariant_name, scenario_id, persona) 三元组聚合失败，输出 `FailureCluster[]`：

```jsonc
{
  "signature": "position_teleport:happy-explore:explorer",
  "description": "position_teleport 失败 5 次：explorer persona 在 happy-explore 场景反复触发位置瞬移",
  "count": 5,
  "exampleRunIds": ["happy-explore-explorer-seed42", "..."]
}
```

Nightly 报告里展示 top 10 cluster，便于发现反复出现的 bug 模式。

## 入口与运行

### 单测（CI 必跑）

```bash
pnpm test:playthrough      # 24 v1 测试
pnpm test:playthrough:v3    # 24 v3 测试（已合并进上面的通配）
```

### 交互式 CLI（手动 / 调试）

```bash
pnpm dlx tsx scripts/run-playthrough.ts --persona explorer --runs 5
pnpm dlx tsx scripts/run-playthrough.ts --no-narrative-judge
```

### Nightly Fuzz Runner

```bash
pnpm dlx tsx scripts/run-playthrough-fuzz.ts \
  --runs 1 \
  --max-steps 20 \
  --fail-on-regression \
  --threshold 0.10 \
  --json-out .runtime-data/playthrough-fuzz-report.json
```

参数：
- `--runs` 每对 (scenario, persona) 跑几局（默认 1）
- `--max-steps` 每局最大步数（默认 20）
- `--categories happy,recovery` 仅跑指定路径
- `--live` 调真实 `/api/chat`（需要 AI gateway）
- `--fail-on-regression` 失败率超阈值时退出码 1
- `--threshold 0.10` 自定义阈值
- `--json-out path` 写 JSON 报告

### Nightly GitHub Actions

`.github/workflows/playthrough-fuzz-nightly.yml`：
- **cron**：每天 UTC 19:00（北京时间 03:00）
- 默认 mock 模式（无外部依赖）
- 可选 live 模式（`workflow_dispatch` 输入 `live_mode=true`）
- 失败率超 10% 时自动开 issue
- trace artifact 上传 30 天

## 文件结构

```text
src/lib/evals/playthrough/
  index.ts                ← 主入口 + 类型导出
  types.ts                ← PersonaType / PlaythroughTranscript 等
  playerAgent.ts          ← 4 persona + mock 动作生成
  invariants.ts           ← L1 确定性不变量（v3 含 DM-only / NPC 复活 / 状态跳变）
  narrativeJudge.ts       ← L2 叙事一致性裁判（mock + live）
  sutAdapter.ts           ← Mock + Http SUT adapter
  scenarios.ts            ← 20 场景 × 4 路径
  orchestrator.ts         ← 单局 + 批次 v3 编排 + 失败聚类
  playthrough.test.ts     ← 24 v1 测试
  playthrough-v3.test.ts  ← 24 v3 测试

scripts/
  run-playthrough.ts          ← v1 CLI runner（保留，兼容旧接口）
  run-playthrough-fuzz.ts     ← nightly fuzz runner（v3，scenario × persona × N）

.github/workflows/
  playthrough-fuzz-nightly.yml   ← nightly cron + workflow_dispatch

.runtime-data/fuzz-traces/    ← trace artifact 输出（默认 gitignore）
.runtime-data/playthrough-fuzz-report.json  ← JSON 聚合报告
```

## 诚实局限

> 模拟器无法替代真实人类 playtester。

**能逮**：
- 状态不一致（HP/理智/原石跳变）
- 剧情矛盾（NPC 复活、位置瞬移）
- 规则绕过（货币溢出、跨职业装备）
- softlock（连续 8 步无进展）
- DM-only 泄漏（系统提示词、JSON 格式字样）

**逮不到**：
- 真实用户行为分布（玩家 70% 会速通、30% 会探索，但具体路径无法预测）
- 主观乐趣（"好玩"不可量化）
- 隐式叙事崩坏（暗示矛盾、伏笔丢失）

## 与其他层的关系

| 层 | 工具 | 速度 | 频率 | 触发 |
|----|------|------|------|------|
| Schema 校验 | Promptfoo | ms | 每个 PR | ci.yml deterministic-assertions |
| 单测 | node:test | ms | 每个 PR | ci.yml verify |
| Playthrough 单测 | node:test | ms | 每个 PR | ci.yml playthrough-mock |
| **Playthrough fuzz** | 自建 | 秒级 | **每晚定时** | **playthrough-fuzz-nightly.yml** |
| DeepEval 叙事层 | pytest | 秒级 | 每晚定时 | playthrough-fuzz-nightly.yml |
| E2E（UI 契约） | Playwright | 30s | 每个 PR | ci.yml e2e-contract |

## 下一步

1. **Live 模式接入**：把 `--live` 跑通，扩 nightly workflow 到真实 AI gateway
2. **历史基线**：在 `.runtime-data/playthrough-fuzz-report.json` 加 git history 跟踪，识别回归
3. **失败聚类 → Issue**：聚类结果直接开 GitHub issue（已实现 30%）
4. **场景扩展**：从 20 个扩到 50 个，覆盖更多支线
5. **人工标注补充**：校准样本从 8 个扩到 30-50 个，跑真实 LLM judge 校准