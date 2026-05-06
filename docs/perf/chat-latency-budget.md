# /api/chat 实时生成性能预算

本文是 VerseCraft 大模型实时生成体验的长期门禁。所有 Codex / AI agent / 人工开发，只要改动 `/api/chat`、`PLAYER_CHAT`、`/play` 等待态、SSE 解析、RAG/lore、DB 读写、安全检查、AI 路由、补救链或 analytics，都必须先对照本文。

预算的代码源头是 `src/lib/perf/waitingConfig.ts` 的 `CHAT_LATENCY_BUDGET`。测试、benchmark、CI 和人工验收都应引用这份常量，不要在 `route.ts`、`page.tsx`、hooks 或脚本里散落新数字。

## 性能预算表

| 指标 | 预算 | 含义 |
| --- | ---: | --- |
| `immediateFeedbackMs` | 300ms | 玩家点击行动后，本地 UI 必须有明确反馈。 |
| `firstPerceivedFeedbackP95Ms` | 800ms | p95 首个可信反馈，包含本地等待态、status frame 或正文。 |
| `firstStatusShownP95Ms` | 800ms | p95 首个 `__VERSECRAFT_STATUS__` 到达时间。 |
| `firstVisibleTextP50Ms` | 2500ms | 正常 AI gateway 可用时，p50 首个可见正文 / first token。 |
| `firstVisibleTextP95Ms` | 5000ms | 正常 AI gateway 可用时，p95 首个可见正文 / first token。 |
| `normalTurnFinalP50Ms` | 12000ms | 普通回合 p50 收到 `__VERSECRAFT_FINAL__`。 |
| `normalTurnFinalP95Ms` | 20000ms | 普通回合 p95 收到 `__VERSECRAFT_FINAL__`。 |
| `maxNoFeedbackGapMs` | 5000ms | 玩家不能经历 5 秒以上完全无反馈等待。 |
| `maxInterChunkGapWarnMs` | 2500ms | 首字后可见文本 chunk 间隔达到该值计为 long gap。 |
| `degradedFirstStatusMaxMs` | 800ms | 无 AI key / degraded 场景也必须快速 status。 |
| `degradedFinalFrameMaxMs` | 5000ms | 无 AI key / degraded 场景必须快速 parseable final。 |

## 首字前路径红线

不得把新功能直接塞进 `/api/chat` 首字前路径。新增任何昂贵逻辑前，必须在 PR 描述或设计说明中回答：

- 这一步是否阻塞首包或首个 status frame？
- 是否可以放到 final hooks，而不是首字前？
- 是否可以放到 background worker / world tick？
- 是否只应该进入 slow lane？
- 是否有明确 budget cap、deadline、cache miss 降级策略？
- 如果失败，是否会扩大 role chain、增加重试或把普通回合拖到分钟级？

默认策略：

- fast lane 不得等待 slow lane 逻辑。
- session memory / lore / KG cache miss 不得阻塞首字。
- DB 写入、ledger、analytics、world tick 必须 best-effort 或后台化。
- options-only / decision-only repair 必须有 per-attempt timeout 和 wall-clock budget。
- PLAYER_CHAT 不得引入 `reasoner`，不得靠扩大 role chain 掩盖失败。

## 不能为了速度牺牲的内容

性能优化只能做预算化、并行化、延后化、降级化，不能删除核心玩法：

- 不得削弱输入/输出安全审查。
- 不得破坏 `/api/chat` `text/event-stream`、`__VERSECRAFT_STATUS__`、`__VERSECRAFT_FINAL__` 契约。
- 不得绕过 DM JSON parse / normalize / guard / resolve 收口链。
- 不得删除 lore、NPC 一致性、epistemic filtering、post-generation validation。
- 不得用模板冒充模型主叙事。
- 不得把 world tick 重新塞回在线首字前路径。
- 不得改坏 `chat_request_finished`、`chat_client_perf` 等 analytics 兼容字段。

## 本地验证

无 AI gateway / degraded 契约：

```bash
npx eslint .
pnpm test:unit
pnpm test:e2e:contract
pnpm build
```

真实 AI gateway / live 性能预算：

```bash
E2E_AI_LIVE=1 VC_ASSERT_CHAT_LATENCY_BUDGET=1 pnpm benchmark:chat-metrics
```

常用 benchmark 参数：

```bash
pnpm benchmark:chat-metrics -- --json --json-out .runtime-data/chat-benchmark.json
pnpm benchmark:chat-metrics -- --assert-budget
VC_BENCHMARK_DEGRADED_SMOKE=1 VC_ASSERT_CHAT_LATENCY_BUDGET=1 pnpm benchmark:chat-metrics
```

浏览器验证仍是必要项：启动 `pnpm dev`，打开 `/play`，连续发送短行动、长行动、异常行动，观察等待态、首字流式、终帧收口，并确认控制台或 analytics 中有 `firstStatusShownMs`、`firstVisibleTextMs`、`finalFrameReceivedMs`、`longGapCount`。

## CI 行为

默认 CI 不要求真实 AI key。它必须验证：

- degraded `/api/chat` 仍返回 `200 + text/event-stream`；
- keys_missing 场景仍有快速 status frame；
- status frame 不污染正文；
- `__VERSECRAFT_FINAL__` 可解析为 DM JSON；
- `/play` 基础打开不回归。

live perf job 只在非 PR 且仓库配置 AI secrets 时运行，或由 `workflow_dispatch` 手动触发。live job 会执行：

```bash
E2E_AI_LIVE=1 VC_ASSERT_CHAT_LATENCY_BUDGET=1 pnpm benchmark:chat-metrics
```

超预算必须失败；无 secrets 时跳过 live benchmark，不影响普通 PR。

## Control Preflight Budget

`PLAYER_CONTROL_PREFLIGHT` 属于首字前路径，默认最多等待 `260ms`。超预算时按“控制面暂不可用”处理，主 `PLAYER_CHAT`、输入安全、post-generation validation、NPC consistency 和 `__VERSECRAFT_FINAL__` 收口继续执行。

回滚开关：

```bash
AI_CONTROL_PREFLIGHT_BUDGET_MS=0
```

该开关只恢复 legacy 等待行为；不要用扩大 control preflight timeout 的方式掩盖上游慢响应。

## Stream Reconnect Wall Budget

主 `PLAYER_CHAT` 流如果在正文前中断，或只返回空白 / 过短内容，允许进入一次保守补救；但补救不能把首个可见正文拖到预算外。默认墙钟是 `3500ms`，超时后直接返回可解析的安全兜底 `__VERSECRAFT_FINAL__`，不再启动第二个 role stream。

回滚 / 调整开关：

```bash
AI_PLAYER_CHAT_STREAM_RECONNECT_WALL_MS=22000
```

如果需要临时恢复更宽的 legacy 行为，也可以关闭 v2 超时族：

```bash
AI_PLAYER_CHAT_TIMEOUTS_V2=0
```

该预算只约束上游空流 / 断流补救，不缩短正常主模型叙事，不改变 `PLAYER_CHAT` role chain 定义，不让 `reasoner` 进入在线主链路。

## 生成质量与稳定护栏

`/api/chat` 的性能门禁现在不只看速度。任何改动 `PLAYER_CHAT`、SSE、prompt、lore/RAG、options repair、waiting UX、AI routing 的 PR，都必须同时保护：

- HTTP 200 + `text/event-stream`。
- 终帧 `__VERSECRAFT_FINAL__` 100% 可解析。
- narrative 非空，且达到 fixture/eval 中声明的最小字符数。
- options 恰好 4 条，除非 eval case 明确允许缺失。
- options 必须是场景内可执行行动，不能是“打开菜单 / 查看背包 / 查看属性 / 查看任务”等 UI 操作。
- 首个 status、首个 visible token、final、long gap 必须来自 `CHAT_LATENCY_BUDGET`。

PR 必跑的无 key 护栏：

```bash
pnpm lint
pnpm test:unit
pnpm build
pnpm test:e2e:contract
AI_PROVIDER=mock pnpm test:e2e:mock
AI_PROVIDER=mock pnpm benchmark:chat-metrics -- --mode mock --assert-budget --include-all --json-out .runtime-data/chat-benchmark-mock.json
AI_PROVIDER=mock pnpm eval:chat-quality -- --mode mock --assert --json-out .runtime-data/eval-chat-quality-mock.json
```

真实网关只在 main push、workflow_dispatch 或 nightly 有 secrets 时运行；PR 不依赖真实 AI key。live 门禁用于发现真实 provider 的 tail latency、token、缓存命中和质量漂移：

```bash
E2E_AI_LIVE=1 VC_ASSERT_CHAT_LATENCY_BUDGET=1 pnpm benchmark:chat-metrics -- --mode live --assert-budget --include-all
E2E_AI_LIVE=1 pnpm eval:chat-quality -- --mode live --assert
```

共享 SSE 解析与统计入口是 `src/lib/perf/chatSseProbe.ts`。E2E 和 benchmark 必须复用它，禁止再复制 `__VERSECRAFT_STATUS__:`、`__VERSECRAFT_FINAL__:`、`__VERSECRAFT_` 的解析逻辑。控制帧前缀由 `src/lib/turnEngine/sse.ts` 导出。

线上可观测性必须记录结构化字段，不记录原始玩家输入、完整 narrative 或完整 prompt。`chat_request_finished` 与 `chatGenerationMetrics` 至少应覆盖 provider/model/logicalRole、promptVersion、stablePrefixHash、firstStatus、firstVisibleText、final、optionsRepair、fallback、token usage 和 OpenTelemetry GenAI 风格字段：`gen_ai.client.token.usage`、`gen_ai.client.operation.duration`、`gen_ai.server.time_to_first_token`。

禁止用以下方式“优化”：

- 为速度删除安全审查、NPC/世界观一致性、epistemic filtering 或 post-generation validation。
- 为速度用模板冒充主叙事。
- 为补齐 options 做无限重试或本地通用补齐。
- 把 DB、analytics、world tick、离线 reasoner 塞回首字前路径。
