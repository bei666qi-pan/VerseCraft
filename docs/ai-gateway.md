# VerseCraft AI 网关（one-api）说明

本文是 **AI 统一网关** 的单一入口文档，与 `docs/ai-architecture.md`（模块目录）互补。

> **本地对接 one-api**：逐步操作、端口约定、排障表见 **[`local-one-api.md`](local-one-api.md)**（推荐先读）。

## 1. 架构说明

- **所有大模型 HTTP 调用**经 [`src/lib/ai/router/execute.ts`](../src/lib/ai/router/execute.ts) 发往 **一个** OpenAI 兼容端点：`AI_GATEWAY_BASE_URL` 解析为 `…/v1/chat/completions`（或你提供的完整 `…/chat/completions` URL）。
- **请求体**由 [`src/lib/ai/gateway/openaiCompatible.ts`](../src/lib/ai/gateway/openaiCompatible.ts) 构造；**Bearer** 使用 `AI_GATEWAY_API_KEY`。
- **业务只认逻辑角色**：`main` / `control` / `enhance` / `reasoner`（见 [`logicalRoles.ts`](../src/lib/ai/models/logicalRoles.ts)）。角色到上游模型名的映射 **仅** 来自环境变量 `AI_MODEL_*`，不在业务 TS 里写死厂商型号字符串。
- **任务路由**见 [`taskPolicy.ts`](../src/lib/ai/tasks/taskPolicy.ts)；玩家流式 fallback 顺序可由 `AI_PLAYER_ROLE_CHAIN`（或兼容旧 `AI_PLAYER_MODEL_CHAIN`）调整。
- **配置读取**统一走 [`envCore.ts`](../src/lib/ai/config/envCore.ts) / [`envRaw.ts`](../src/lib/config/envRaw.ts)；`src/` 内除配置层与 Next 框架约定（如 `NODE_ENV`）外不应直接读 `process.env`。
- **旧 .env 迁移**：[`legacyVendorModelIdToRole`](../src/lib/ai/models/logicalRoles.ts) 仅解析历史 `AI_PLAYER_MODEL_CHAIN` 等，**不属于 one-api 协议层**，与业务语义入口 [`logicalTasks.ts`](../src/lib/ai/logicalTasks.ts) 解耦。

## 2. 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_GATEWAY_PROVIDER` | 否 | 默认 `oneapi` |
| `AI_GATEWAY_BASE_URL` | 是* | one-api 根 URL 或完整 chat-completions URL |
| `AI_GATEWAY_API_KEY` | 是* | 网关访问令牌（勿 `NEXT_PUBLIC_*`） |
| `AI_MODEL_MAIN` | 是* | 主叙事、多数裁决类任务 |
| `AI_MODEL_CONTROL` | 建议 | 控制面 / 意图 / 安全预筛 |
| `AI_MODEL_ENHANCE` | 建议 | 场景增强、情绪润色（Phase 1 可直接映射到 `AI_MODEL_MAIN`） |
| `AI_MODEL_REASONER` | 建议 | 离线推演、管理洞察 |
| `AI_ENABLE_NARRATIVE_ENHANCEMENT` | 否 | 叙事增强总开关；默认关闭（`false`） |
| `AI_PLAYER_ROLE_CHAIN` | 否 | 玩家 SSE 候选顺序，如 `main,control` |
| `AI_PLAYER_MODEL_CHAIN` | 否 | **遗留**：旧厂商 id 会映射为角色 |
| `AI_MEMORY_PRIMARY_ROLE` / `AI_MEMORY_MODEL` | 否 | 记忆压缩链首选 |
| `AI_DEV_ASSIST_PRIMARY_ROLE` / `AI_ADMIN_MODEL` | 否 | 管理洞察链首选 |
| `AI_REQUEST_TIMEOUT_MS` / `AI_TIMEOUT_MS` | 否 | 超时毫秒 |
| `AI_ENABLE_STREAM` | 否 | 默认 `true`；与任务 `stream` 组合 |
| `AI_LOG_LEVEL` | 否 | `silent` \| `error` \| `info` \| `debug` |
| `AI_MAX_RETRIES` 等 | 否 | 重试与熔断，见 `.env.example` |
| `VERSECRAFT_DM_STABLE_PROMPT_VERSION` | 否 | 变更后使玩家 DM **稳定 system 前缀**进程内 memo 失效（静态规则/世界观更新时 bump） |
| `AI_PLAYER_CHAT_SPLIT_SYSTEM` | 否 | `1` 时 PLAYER_CHAT 使用两条 `system`（stable + dynamic）；默认单条拼接 |
| `AI_GATEWAY_MERGE_EXTRA_BODY` | 否 | `1` 时把 `AI_GATEWAY_EXTRA_BODY_JSON` 解析为对象并**浅合并**进请求体（不覆盖 `messages`/`model`/`stream`/`max_tokens` 等保留键） |
| `AI_CONTROL_PREFLIGHT_BUDGET_MS` | 否 | 见 §7 预检墙钟预算；`0` 表示不截断 |
| `AI_LORE_RETRIEVAL_BUDGET_MS` | 否 | 见 §7 lore 检索墙钟预算；`0` 表示不截断 |
| `AI_NARRATIVE_ENHANCE_BUDGET_MS` | 否 | 见 §7 尾段增强墙钟预算；`0` 表示仅用任务内超时 |
| `AI_STREAM_MODERATION_THROTTLE_MS` | 否 | 见 §7 流式输出审核节流；`0` 表示每 delta 必审 |

\*：`anyAiProviderConfigured()` 要求至少 **网关 URL + Key + `AI_MODEL_MAIN`** 非空；其他角色若未配置，对应任务链会自动跳过该角色。

### 玩家 DM：稳定前缀 + 动态后缀（前缀缓存友好）

- 实现：`src/lib/playRealtime/playerChatSystemPrompt.ts`。**Stable** = 核心规则与稳定锚点（含固定标题 `## 【本回合动态上下文】`，memo + `VERSECRAFT_DM_STABLE_PROMPT_VERSION`）；**dynamic** = 压缩记忆、`当前玩家状态`、控制增强与运行时检索 lore 注入（RAG block）。
- 路由：`src/app/api/chat/route.ts` 组装后交给 `sanitizeMessagesForUpstream`；配额估算使用 stable+dynamic（**不含**控制面 augmentation 的旧口径对齐：仅 stable + 记忆/状态/首局，即 `controlAugmentation: ""` 的 dynamic）。
- **观测**：分析事件 `chat_request_finished` payload 含 `stableCharLen`、`dynamicCharLen`、`cachedPromptTokens`（上游支持时）；结构化日志见下文与 `docs/ai-governance.md`。

### 超时说明：`/api/chat` 外层与 `execute` 内层

- **玩家 SSE 路由**在 [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts) 内对 `executePlayerChatStream` 使用 **硬编码 60s** 的 `AbortController`，用于防止浏览器长时间挂起；与 `AI_REQUEST_TIMEOUT_MS` / `AI_TIMEOUT_MS`（`resolveAiEnv().defaultTimeoutMs`，供 `execute` / 控制面预检等使用）**不是同一常量**。
- 调整「上游等待多久」：优先改 **`AI_REQUEST_TIMEOUT_MS`**（或 `AI_TIMEOUT_MS`）；若仍觉得 `/play` 侧整体过长/过短，需改 route 中外层 `TIMEOUT_MS`（属代码单点，非多模块散落）。
- 控制面预检在 route 内另有 **约 11s** 的独立上限，与上述两者独立。

### Legacy 环境变量迁移（`#legacy-migration`）

- **推荐**：只使用 **`AI_PLAYER_ROLE_CHAIN`**，值为 `main` / `control` / `enhance` / `reasoner` 的逗号分隔列表。
- **遗留**：`AI_PLAYER_MODEL_CHAIN`、`AI_MEMORY_MODEL`、`AI_ADMIN_MODEL` 中的旧 id 仍可通过 [`legacyVendorModelIdToRole`](../src/lib/ai/models/logicalRoles.ts) 映射到角色；**计划在将来大版本移除字符串映射**，迁移前请改为 `AI_PLAYER_ROLE_CHAIN` + `AI_MODEL_*`。
- 开发环境下若仍仅用 `AI_PLAYER_MODEL_CHAIN` 而未设 `AI_PLAYER_ROLE_CHAIN`，进程会在**首次** `resolveAiEnv()` 时打印一次弃用警告。

完整列表以仓库根目录 [`.env.example`](../.env.example) 为准（含「迁移附录」示例）。

## 3. 本地运行说明

**傻瓜路径（本机 one-api）**：见 **[`local-one-api.md`](local-one-api.md)**；可配合根目录 [`.env.local.oneapi.example`](../.env.local.oneapi.example) 或 `pnpm patch:env-local-ai`。

1. `cp .env.example .env.local`
2. 将 `AI_GATEWAY_BASE_URL` 指向 **本机 one-api**（例如 `http://127.0.0.1:3000`，应用会自动补 `/v1/chat/completions`，除非已写完整路径）。
3. 填写 `AI_GATEWAY_API_KEY` 与四个 `AI_MODEL_*`（与 one-api 中配置的模型名一致）。
4. `pnpm dev`，浏览器访问 `http://localhost:666`（见 `docs/local-development.md`）。
5. 可选：`pnpm verify:ai-gateway` 快速检查配置是否齐全（不发起真实请求）；`VERIFY_AI_GATEWAY_STRICT=1` 时缺项则退出码 1。
6. 可选：`pnpm probe:ai-gateway` 对已配置网关发起 **极小** 非流式补全以验证连通（可能产生极少费用）。

## 4. Coolify / 生产配置说明

在 Coolify **Environment Variables** 中配置与 `.env.example` **同名**的键（不要使用 `.env.local` 文件）。至少包含：

- `DATABASE_URL`、`AUTH_SECRET`、及其他已有生产项
- `AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`
- `AI_MODEL_MAIN`、`AI_MODEL_CONTROL`、`AI_MODEL_ENHANCE`、`AI_MODEL_REASONER`
- Phase 1 推荐三部署映射：`AI_MODEL_MAIN=vc-main`、`AI_MODEL_CONTROL=vc-control`、`AI_MODEL_ENHANCE=vc-main`、`AI_MODEL_REASONER=vc-reasoner`

容器内应用与本地共用同一套代码路径；**无**「仅线上」或「仅本地」分支。

## 5. 切模型操作说明（最小路径）

1. **优先**：在 **one-api 控制台** 修改渠道或模型映射，使原 `AI_MODEL_*` 字符串仍指向同一逻辑名，但上游已换模型 → **VerseCraft 零改**。
2. **其次**：只改 Coolify / `.env.local` 中的 **`AI_MODEL_MAIN`**（或对应角色变量）为新 one-api 模型 id → **不改业务代码**。
3. **再其次**：调整 **`AI_PLAYER_ROLE_CHAIN`** 改变玩家 fallback 顺序（仍为角色名，非厂商字符串）。
4. 避免在多个业务模块改模型；若出现需改 TS 的情况，应视为配置抽象不足，应收到 `envCore` / `taskPolicy` 而非散落到 feature 代码。

## 6. 常见故障排查

| 现象 | 检查 |
|------|------|
| 进入游戏提示未配置大模型 / SSE 降级文案 | `AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`、`AI_MODEL_MAIN` 是否非空；`pnpm verify:ai-gateway` |
| 502 / 链上全部失败 | one-api 是否可达、令牌是否有效、one-api 内模型名是否与 `AI_MODEL_*` 一致 |
| 仅主模型失败、副角色成功 | 看结构化日志 `logicalRole` / `gatewayModel`；检查对应 `AI_MODEL_*` |
| 流式无输出 | `AI_ENABLE_STREAM`、上游是否支持 SSE；见 `docs/troubleshooting-ai.md` |
| JSON 结构异常 | 上游是否支持 `json_object`；控制类任务需要 JSON 时应在 one-api 侧选支持该模式的模型 |

更细的分类与日志字段说明见 [`docs/troubleshooting-ai.md`](troubleshooting-ai.md)。

## 7. 流式 PLAYER_CHAT 观测字段（摘要）

- **`ai.telemetry`**：`phase: stream_first_token` 记录首包 TTFT（`ttftMs`）及 `stableCharLen` / `dynamicCharLen`（默认不写控制台，仅 `AI_LOG_LEVEL=debug` 打印 JSON）；`phase: stream_complete` 记录结束时的 `usage`（含 `cachedPromptTokens` 若上游返回）；`phase: preflight_budget` 同时用于记录控制面预检预算命中（`AI_CONTROL_PREFLIGHT_BUDGET_MS`）与 lore 检索预算命中（`AI_LORE_RETRIEVAL_BUDGET_MS`）。
- **`ai.observability`**：同上部分字段进入环形缓冲，便于 `GET /api/admin/ai-routing` 排障。
- **TokenUsage**：`normalizeUsage`（`src/lib/ai/stream/openaiLike.ts`）会解析 `usage.prompt_tokens_details.cached_tokens`、`cached_prompt_tokens` 等别名。
- **分析事件**：`chat_request_started` 的 `payload.controlPreflightBudgetHit` 标记本回合是否触发预检预算截断。

### `/api/chat` 延迟与顺滑（第三轮，默认与旧行为一致）

| 变量 | 默认 | 说明 |
|------|------|------|
| `AI_CONTROL_PREFLIGHT_BUDGET_MS` | `0` | `>0` 时预检最多等待该毫秒；超时则与「预检失败」相同，继续主模型流式（缩短 TTFT 尾部）。上限 10000。 |
| `AI_LORE_RETRIEVAL_BUDGET_MS` | `600` | `>0` 时 lore 最多等待该毫秒；超时走 fallback lore 路径，不阻塞主模型开流。上限 5000。 |
| `AI_NARRATIVE_ENHANCE_BUDGET_MS` | `0` | `>0` 时尾段感官增强 LLM 额外墙钟上限；超时放弃增强，仍发主模型 JSON（缩短终帧延迟）。上限 60000。 |
| `AI_STREAM_MODERATION_THROTTLE_MS` | `0` | `>0` 时对 **JSON delta** 的 `postModelModeration` 按最小间隔节流（中间 delta 先直出，**削弱**分块审核密度；终帧仍有 `finalOutputModeration`）。上限 2000。 |

另见治理项 **`AI_ENHANCE_GATE_MIN_SCORE`**（[`docs/ai-governance.md`](ai-governance.md)）：提高后增强门控更严，默认 `32` 与历史一致。

- **功能等价**：预检/增强超时均走既有「控制面不可用」「增强失败」路径；`__VERSECRAFT_FINAL__` 与客户端解析不变。
- **成本与网关**：调用次数逻辑不变；预算截断会多产生被中止的上游请求，可在网关观察并调预算。

### `analytics_events`：`chat_request_finished`（DB 可聚合）

以下字段写入 **`analytics_events.payload`（jsonb）**，不含剧情正文，便于量化 TTFT、token、预检与尾段增强（实现见 `src/lib/analytics/chatRequestFinishedPayload.ts`）。

| 字段 | 说明 |
|------|------|
| `firstChunkLatencyMs` | TTFT（毫秒）或 null |
| `totalLatencyMs` | 回合总墙钟（含流式结束后的终帧钩子等） |
| `promptTokens` / `completionTokens` / `totalTokens` / `cachedPromptTokens` | 流末 `TokenUsage`；上游未返回则为 null |
| `gatewayModelMain` | 主跳实际上游模型名（若有） |
| `preflightRan` | 是否进入控制面预检执行路径 |
| `preflightSkippedReason` | 未跑预检时：`emergency`、`session_budget` 或 null |
| `preflightCacheHit` | 预检缓存命中；未跑预检为 null |
| `preflightLatencyMs` | 预检墙钟毫秒（缓存命中多为 0） |
| `preflightOk` | 是否得到可用 control |
| `preflightBudgetHit` | 是否触发 `AI_CONTROL_PREFLIGHT_BUDGET_MS` |
| `enhanceAttempted` | 是否进入尾段增强路径（已解析出可处理的 DM JSON） |
| `enhanceOutcome` | `none`、`applied`、`skipped`、`error` |
| `enhanceSkipReason` | 跳过原因；成功为 null |
| `enhanceLatencyMs` | 增强墙钟 |
| `enhancePromptTokens` / `enhanceCompletionTokens` / `enhanceTotalTokens` | 仅增强 **applied** 且上游返回 usage 时有值 |
| `streamReconnectCount` / `streamInterruptedCount` / `streamEmptyCount` | 流重连总次数、由中断触发次数、由空流触发次数 |
| `finalJsonParseSuccess` | 终帧前是否成功解析出合法 DM JSON（失败时会走安全回落 JSON） |

`chat_request_started` 的 `payload` 另含：`preflightRan`、`preflightSkippedReason`、`preflightCacheHit`、`preflightLatencyMs`、`preflightOk`、`controlPreflightBudgetHit`。

**示例 SQL**（表不存在或 42P01 时与现有 analytics 降级一致，查询可能无数据）：

```sql
-- 近 7 日按天平均 TTFT / 总耗时（成功回合）
SELECT
  date_trunc('day', event_time) AS d,
  AVG((payload->>'firstChunkLatencyMs')::numeric) AS avg_ttft_ms,
  AVG((payload->>'totalLatencyMs')::numeric) AS avg_total_ms
FROM analytics_events
WHERE event_name = 'chat_request_finished'
  AND (payload->>'success')::boolean = true
  AND event_time > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;

-- 按最终逻辑角色聚合延迟与 prompt tokens
SELECT
  payload->>'aiActualLogicalRole' AS role,
  AVG((payload->>'totalLatencyMs')::numeric) AS avg_total_ms,
  AVG((payload->>'promptTokens')::numeric) AS avg_prompt_tok
FROM analytics_events
WHERE event_name = 'chat_request_finished'
  AND event_time > NOW() - INTERVAL '7 days'
GROUP BY 1;

-- 预检耗时与缓存命中率（仅 ran=true 子集）
SELECT
  AVG((payload->>'preflightLatencyMs')::numeric) FILTER (WHERE (payload->>'preflightRan')::boolean) AS avg_preflight_ms,
  SUM(CASE WHEN (payload->>'preflightCacheHit')::boolean THEN 1 ELSE 0 END)::float
    / NULLIF(COUNT(*) FILTER (WHERE (payload->>'preflightRan')::boolean), 0) AS preflight_cache_rate
FROM analytics_events
WHERE event_name = 'chat_request_finished'
  AND event_time > NOW() - INTERVAL '7 days';
```

### 基准样本与脚本

- 目录：[benchmarks/chat-turns/README.md](../benchmarks/chat-turns/README.md)
- 打印体积与说明：`pnpm benchmark:chat-metrics`
- 实机首包探针：`E2E_AI_LIVE=1 pnpm benchmark:chat-metrics`（默认 `http://localhost:666`，可用环境变量 `BENCHMARK_BASE_URL` 覆盖）

### 本地预览端口

- `pnpm dev` / `pnpm preview` 使用 **666** 端口；浏览器或 Cursor Simple Browser 打开 `http://localhost:666`。

## 8. 测试与回归

- **单元**：`pnpm test:unit`（含 `envCore`、`taskPolicy`、流式 fallback mock、`openaiCompatible` 请求体、`normalizeUsage` 缓存字段、`playerChatSystemPrompt` stable memo、`chatRequestFinishedPayload`、`benchmarks/chat-turns` fixture 形状）。
- **网关验证脚本**：`pnpm verify:ai-gateway`（配置完整性，不扣费）；严格模式见上文。
- **CI 契约 E2E**：`pnpm test:e2e:contract`（`chat-sse-contract` + `play-open`）：在 **未配置网关** 时期望 `X-VerseCraft-Ai-Status: keys_missing` 的降级 SSE；GitHub `ci.yml` 已接入（CI 内用 `PLAYWRIGHT_BASE_URL` + `PLAYWRIGHT_WEB_SERVER_COMMAND` 在 **3000** 端口起 dev，避免与本机 666 占用冲突）。
- **真网关冒烟**：本机导出 `E2E_AI_LIVE=1` 并确保 shell 与 `pnpm dev` 均能读到 `AI_GATEWAY_*`、`AI_MODEL_MAIN` 后运行 `pnpm test:e2e:chat` 或 `pnpm test:e2e:contract`，将额外跑「非 keys_missing」断言（易超时/耗额度，勿在 CI 默认开启）。
- **手动可选**：仓库提供 [ai-gateway-verify.yml](../.github/workflows/ai-gateway-verify.yml)（`workflow_dispatch`）：在仓库 **Settings → Secrets** 添加与 `.env.example` 同名的 `AI_GATEWAY_*`、`AI_MODEL_*` 后手动运行，执行 `VERIFY_AI_GATEWAY_STRICT=1`（不向 fork PR 注入密钥）。
