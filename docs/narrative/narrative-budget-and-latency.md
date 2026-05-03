# Narrative Budget And Latency Controls

## 问题背景

VerseCraft 的 PLAYER_CHAT 主回合需要同时满足两件事：

- narrative 不能过短，否则玩家看不到动作后果、环境反馈、NPC 反应、风险变化和线索推进。
- 首字可见体验不能被牺牲，`/api/chat` 的 SSE、TTFT、等待态、options-only fallback、安全审核和风控链路必须保持稳定。

这次改造把“叙事篇幅”从一句宽泛 prompt 要求，拆成可观测、可回滚的运行时预算系统。

## 为什么不能只写“多写点”

只在 prompt 里要求“多写点”会带来三个问题：

- 每个回合都变长，简单动作也会变贵、变慢。
- 模型不知道本回合是 micro、standard、reveal 还是 climax，容易在关键回合写短，在普通回合灌水。
- 没有 telemetry 就无法判断是 prompt、`max_tokens`、JSON 结构挤占、上游慢还是前端等待态造成的问题。

因此本次改造采用“预算 packet + 动态 maxTokens + 后验评估 + 默认关闭的受限增写”。

## narrative_budget_packet 设计

入口模块：

- `src/lib/playRealtime/narrativeBudgetPackets.ts`

每回合在调用主模型前解析出：

- `tier`
- `minChars`
- `targetChars`
- `maxChars`
- `minInfoBeats`
- `mustInclude`
- `stopRule`
- `reasonCodes`

packet 注入 `buildDynamicPlayerDmSystemSuffix` 的动态上下文，不插入 stable prefix 前面，避免破坏稳定前缀缓存思路。packet JSON 保持紧凑并可 parse，`reasonCodes` 使用稳定英文短码，便于 telemetry 聚合。

## tier 到字数范围映射

| tier | 适用场景 | 字数预算 |
| --- | --- | --- |
| `micro` | 危险骤停、死亡边缘、强悬念断点、必须立即选择 | 80-160 |
| `short` | 简单动作、轻量调查、短对白、无重大状态变化 | 160-260 |
| `standard` | 常规探索、场景推进、普通 NPC 互动、普通任务推进 | 260-520 |
| `reveal` | 高价值线索、重要 NPC 情绪变化、关系突破、关键发现 | 520-850 |
| `climax` | 章节高潮、重大危机爆发、主威胁强介入、重大转折 | 700-1100 |
| `ending` | 结局、章节终局、复盘 | 600 以上，并保留上限保护 |

`minChars`、`targetChars`、`maxChars` 都在模块内 clamp，避免异常上下文把预算放大到不可控范围。

## maxTokens 策略

入口模块：

- `src/lib/ai/tasks/taskPolicy.ts`

PLAYER_CHAT 按 narrative tier 计算每回合 `max_tokens`：

| tier | maxTokens |
| --- | ---: |
| `micro` | 896 |
| `short` | 1152 |
| `standard` | 1536 |
| `reveal` | 1792 |
| `climax` | 1792 |
| `ending` | 2304 |

硬 clamp：

- min: `896`
- max: `2304`

回滚 env：

- `AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE`

该 env 存在合法数字时优先生效，但仍被 clamp 到 `896-2304`。该 override 只影响 PLAYER_CHAT 流式主链路，不影响 `INTENT_PARSE`、options-only fallback、memory compression 或其他非 PLAYER_CHAT 任务。

## 受限增写策略

入口模块：

- `src/lib/turnEngine/narrativeLength.ts`
- `src/lib/turnEngine/narrativeExpansion.ts`
- `src/lib/ai/logicalTasks.ts` 的 `expandNarrativeOnly`

后验评估在主模型输出并 normalize 后运行，只记录 telemetry，不阻断、不截断、不替换正文。

受限增写只有在全部条件满足时才允许一次：

- `AI_NARRATIVE_EXPANSION_ENABLED=true`
- `assessNarrativeLength.severity === "medium"`
- tier 为 `standard`、`reveal` 或 `climax`
- 非 safety fallback
- `is_action_legal !== false`
- `is_death !== true`
- 非 system transition
- 无协议污染或安全降级
- 当前性能预算允许

增写任务只接受 `{"narrative":"..."}`，只能替换 narrative，不能修改任何结构字段，不能新增 NPC、地点、道具、任务，也不能提前揭示世界真相。失败、超时、非法 JSON、超出 `maxChars` 或疑似改变结论时，保留原 narrative。

## 默认 feature flag 状态

- `AI_NARRATIVE_EXPANSION_ENABLED`
  - production 默认 `false`
  - development / staging / preview 默认 `true`
  - 可显式设置为 `false` 关闭

动态 narrative budget 与动态 PLAYER_CHAT maxTokens 默认启用；若要回滚 maxTokens 行为，使用 `AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE=896` 可把所有 PLAYER_CHAT 回合压回旧的短预算级别。

## telemetry 字段

已接入 `chat_request_finished` payload 和 rollout metrics 的字段包括：

- `narrativeBudgetTier`
- `narrativeBudgetReasonCodes`
- `narrativeMinChars`
- `narrativeTargetChars`
- `narrativeMaxChars`
- `actualNarrativeChars`
- `estimatedInfoBeats`
- `narrativeLengthSeverity`
- `narrativeLengthIssueCodes`
- `narrativeUnderMin`
- `narrativeOverMax`
- `playerChatMaxTokens`
- `narrativeExpansionTriggered`
- `narrativeExpansionSucceeded`
- `narrativeExpansionSkippedReason`
- `narrativeExpansionLatencyMs`
- `narrativeBeforeChars`
- `narrativeAfterChars`

响应速度相关字段继续观察：

- `firstSseWriteAt`
- `firstVisibleTextMs`
- `totalLatencyMs`
- `maxInterChunkGapMs`
- `longGapCount`

## 响应速度保护原则

- 不改 SSE 协议，继续使用 `text/event-stream`、`data:`、`__VERSECRAFT_STATUS__`、`__VERSECRAFT_FINAL__`。
- 不扩大 PLAYER_CHAT retry、role chain、timeout 或 options-only fallback 尝试次数。
- `micro` 和 `short` 不使用大 `max_tokens`，避免简单回合无意义变慢。
- narrative expansion 默认不会进入 production，且发生在主模型流式输出完成后，不用于首字前路径。
- options-only fallback 保持独立链路，不被 PLAYER_CHAT narrative budget 合并。
- 前端 `useSmoothStream` 与 `usePlayWaitUx` 只做小幅守护，不伪造正文。

## 回滚方式

关闭受限增写：

```bash
AI_NARRATIVE_EXPANSION_ENABLED=false
```

覆盖动态 maxTokens，使 PLAYER_CHAT 回到旧短预算：

```bash
AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE=896
```

保留 telemetry 但关闭行为改动：

- 设置 `AI_NARRATIVE_EXPANSION_ENABLED=false`
- 设置 `AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE=896`
- 保留 narrative length assessment 与 `chat_request_finished` 字段，用于继续观察问题。

移除 `narrative_budget_packet` 注入的代码级回滚点：

- `/api/chat` 中不再生成 `narrativeBudgetBlock`
- 调用 `buildDynamicPlayerDmSystemSuffix` 时不传 `narrativeBudgetBlock`
- 保留 `resolveNarrativeBudget` 纯函数与 telemetry 字段不会破坏 SSE 或状态提交。

## 已知风险

- `reveal`、`climax`、`ending` 的 token 上限提高后，上游总耗时可能变长，需要重点看 p95/p99 和长 chunk gap。
- production 如果显式打开 expansion，会增加一次非流式 LLM 调用；必须先观察 `narrativeExpansionLatencyMs` 与成功率。
- budget packet 会影响主模型风格和节奏，但结构字段仍以 normalize、guard、resolveDmTurn 为准。
- 叙事长度评估是轻量字符和 info beat 估算，不是语义真值判定；它用于 telemetry 和受限触发，不应作为硬阻断。
## 2026-05-03 follow-up: cache, usage, and display guards

- Prompt cache posture: keep `getStablePlayerDmSystemPrefix()` free of per-turn packets. `narrative_budget_packet` remains in `buildDynamicPlayerDmSystemSuffix()` near the other dynamic runtime packets, and the packet stays to one compact JSON line.
- Structured output posture: PLAYER_CHAT still uses JSON object mode only. A stricter DM JSON schema should be trialed behind docs/tests first because first-use schema processing can add latency, and `max_tokens` truncation can still produce incomplete JSON.
- Stream observability: when an upstream OpenAI-compatible stream exposes `finish_reason` or `usage`, the route records finish reason, prompt/completion/total tokens, cached prompt tokens, and a `finishReasonLength` flag without adding user-visible delay.
- Long narrative display guard: backlog catch-up can emit slightly larger semantic chunks, but remains bounded so longer narrative does not flush instantly or look stalled.
- Admin dashboard candidates: aggregate `narrativeBudgetTier`, `narrativeUnderMin`, `narrativeExpansionTriggered`, `narrativeExpansionSucceeded`, `playerChatFinishReasonLength`, p95 `firstVisibleTextMs` by tier, and p95 `totalLatencyMs` by tier from existing analytics payloads.
