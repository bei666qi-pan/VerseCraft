# TEST_SCOPE_MAP — 文件→测试映射

> 自动推断规则 + 实际测试文件清单

## 映射规则

| 修改区域 | Focused Test | Contract Test | E2E Test | Eval/Benchmark |
|----------|-------------|---------------|----------|----------------|
| `src/lib/turnEngine/*` | `src/lib/turnEngine/*.test.ts` | `chatRouteContract.test.ts` | `chat-sse-contract.spec.ts` | `benchmark:chat-metrics` |
| `src/lib/playRealtime/*` | `normalizePlayerDmJson.test.ts` 等 | 同上 | 同上 | 同上 |
| `src/app/api/chat/*` | `route.*.contract.test.ts` | 同上 | `chat-sse-contract.spec.ts`, `play.spec.ts` | `benchmark:chat:mock` |
| `src/store/*` | — | — | `play.spec.ts`, `idb-hydration.spec.ts` | — |
| `src/db/*` | — | — | — | `db:check` |
| `src/lib/ai/*` | `*.test.ts` | `execute.gateway-contract.test.ts` | — | `verify:ai-gateway` |
| `src/lib/epistemic/*` | `detector.test.ts` | — | — | `eval:narrative-safety:mock` |
| `src/lib/npcConsistency/*` | `validator.test.ts`, `canonNameValidator.test.ts` | — | — | `eval:npc-consistency:mock` |
| `src/lib/security/*` | — | — | — | `eval:narrative-safety:mock` |
| `src/lib/chapters/*` | `engine.test.ts` | — | `chapter-flow.spec.ts` | — |
| `src/lib/evals/*` | `**/*.test.ts` | — | — | 对应 eval 脚本 |
| `src/features/play/*` | — | — | `play.spec.ts`, `mobile-reading-ui.spec.ts` | — |
| `e2e/*` | — | — | 改动的 spec 本身 | — |

## 实际测试文件清单

### Unit Tests (`src/**/*.test.ts`)

主要模块：
- `src/lib/turnEngine/`: `commitTurn.test.ts`, `validateNarrative.test.ts`, `ttftSmoke.test.ts`, `enforceRequiredFields.test.ts`, `enrichGameState.test.ts`
- `src/lib/playRealtime/`: `normalizePlayerDmJson.test.ts`, `chatRouteContract.test.ts`, `deterministicServiceTurn.test.ts`
- `src/lib/ai/`: `logicalTasks.test.ts`, `taskPolicy.test.ts`, `qualityRegressionSamples.test.ts`, `agentContext.test.ts`
- `src/lib/epistemic/`: `detector.test.ts`
- `src/lib/npcConsistency/`: `validator.test.ts`, `canonNameValidator.test.ts`, `rolloutMatrix.test.ts`, `phase9RolloutGoldenScenes.test.ts`
- `src/lib/combat/`: 10+ test files
- `src/lib/evals/`: `judge/judge.test.ts`, `playthrough/playthrough.test.ts`, harness tests
- `src/lib/narrativeGovernance/`: `foreshadowLedger.test.ts`
- `src/lib/narrativeEngine/`: `runLogger.test.ts`

### Contract Tests
- `src/app/api/chat/route.deferMainTurnOptions.contract.test.ts`
- `src/app/api/chat/route.optionsRegenIsolation.contract.test.ts`
- `src/app/api/chat/route.emptyStreamRecovery.contract.test.ts`
- `src/lib/playRealtime/chatRouteContract.test.ts`
- `src/lib/ai/router/execute.gateway-contract.test.ts`
- `src/lib/ai/router/execute.playerStream.fallback.test.ts`

### E2E Tests (关键)
- `chat-sse-contract.spec.ts` — SSE 帧结构
- `chat-latency-budget.spec.ts` — 延迟预算
- `play.spec.ts` (21K) — 核心游玩
- `mobile-reading-ui.spec.ts` (65K) — 移动 UI
- `chapter-flow.spec.ts` (20K) — 章节
- `idb-hydration.spec.ts` — 存档
- `mock-playthrough-closed-loop.spec.ts` (14K) — Mock 闭环
- `live-playthrough-closed-loop.spec.ts` — Live 闭环
- `browser-playthrough.spec.ts` — 浏览器 playthrough
- `codex-browser-playthrough.spec.ts` — Codex handoff

### Benchmarks
- `benchmarks/chat-turns/` — 对话轮次基准
- `benchmarks/game-mechanics/runner.ts` — 游戏机制
- `benchmarks/history/` — 历史评测数据
- `benchmarks/human-eval/` — 人工评测 gold set

## 快速门 vs 完整门选择

```
改动在 src/lib/turnEngine/validateNarrative.ts
  → 风险 L3
  → 快速门: focused unit (validateNarrative.test.ts)
  → PR 门: + contract (chatRouteContract.test.ts) + e2e contract
  → 发布门: + mock eval (eval:narrative-safety:mock)

改动在 src/store/useGameStore.ts
  → 风险 L2
  → 快速门: 相关 unit
  → PR 门: + e2e play + idb-hydration
  → 发布门: + full e2e suite (390×844, 393×852, 430×932)
```
