## VerseCraft /api/chat：TTFT 真实链路诊断（开发态）

本页用于**不改 SSE 契约、不改主 UI 风格**前提下，补齐 `/api/chat` 从「点击发送」到「首字可见」的真实链路诊断与可量化基线。

### 1) 统一 requestId（贯穿 server → stream → client render）

- **客户端生成**：每次 `sendAction()` 创建 `requestId`（形如 `vc_chat_...`），通过请求头发送：
  - `x-versecraft-request-id`
- **服务端沿用**：`src/app/api/chat/route.ts` 优先使用入站 header 的 requestId，否则自生成。
- **服务端回传**：所有 SSE / 降级响应统一回写响应头：
  - `x-versecraft-request-id`

### 2) 客户端可见反馈指标（写入 analytics_events）

事件：`chat_client_perf`（`payload.requestId` 是链路主键）

- **firstStatusShownMs**
  - 定义：从用户触发发送（`sendAction()`起点）到 UI 首次进入 `waiting_upstream` 并完成一次布局提交的时间。
- **firstChunkReceivedMs**
  - 定义：从起点到客户端首次收到任何非空 SSE `data:` payload 的时间（网络/代理/服务端写入共同影响）。
- **firstVisibleTextMs**
  - 定义：从起点到正文首个可见字符真正被渲染到屏幕（由 `useSmoothStreamFromRef` 的 `onChunkRendered` 首次触发近似）。
- **firstPerceivedFeedbackMs**
  - 定义：从起点到界面首次出现“任何可信反馈”（`firstStatusShownMs`/`firstChunkReceivedMs`/`firstVisibleTextMs` 三者最早者）。
- **responseHeadersMs**
  - 定义：从起点到 `/api/chat` response headers 可用（用于区分“连自己服务器都没通” vs “SSE 首包慢”）。
- **finalFrameReceivedMs**
  - 定义：从起点到收到 `__VERSECRAFT_FINAL__:` 终帧 SSE 事件（不改变最终帧协议）。
- **maxInterChunkGapMs / longGapCount**
  - 定义：流式过程中 chunk 间最大间隔、以及 ≥2.5s 的长停顿次数（定位“首字后仍不自然”的停顿点）。

### 3) 服务端阻塞分段（写入 chat_request_finished.payload.serverPerf，仅开发态）

在 `AI_CHAT_ENABLE_DIAGNOSTICS=1`（默认 dev 开启）下，`chat_request_finished` 事件 payload 会额外包含：

- `serverPerf.jsonParseMs`：`req.json()` 解析
- `serverPerf.authSessionMs`：`auth()`/session 获取
- `serverPerf.validateChatRequestMs`
- `serverPerf.moderateInputOnServerMs`
- `serverPerf.preInputModerationMs`
- `serverPerf.quotaCheckMs`
- `serverPerf.sessionMemoryReadMs`
- `serverPerf.controlPreflightMs`
- `serverPerf.loreRetrievalMs`
- `serverPerf.promptBuildMs`
- `serverPerf.upstreamConnectMs`：从 `generateMainReply()` 调用起点到服务端收到上游首个有效流 chunk 的时间
- `serverPerf.firstSseWriteDeltaMs / totalTtftMs`：服务端首次写入 SSE 的时刻与总 TTFT（服务端视角）

### 4) execute.ts 内部观测（ai.telemetry）

`src/lib/ai/router/execute.ts` 在 `ai.telemetry` 结构化日志中新增：

- `bodyBuildMs`：构建上游请求 body（本地 CPU）
- `providerInitMs`：构建 fetch init/headers（本地 CPU）

### 5) 如何用它排查 TTFT 过高

按链路分三类问题：

- **首字前阻塞**：看 `serverPerf.*` + `responseHeadersMs/firstChunkReceivedMs`
  - 典型：输入安全/预检/DB/提示词拼装、或上游排队（`upstreamConnectMs`）
- **首字后但首屏仍不自然**：看 `maxInterChunkGapMs/longGapCount` + `finalFrameReceivedMs`
  - 典型：上游长停顿、浏览器渲染节奏/打字机策略导致“断续感”
- **纯感知问题**：`firstPerceivedFeedbackMs` 已很低但仍“感觉慢”
  - 典型：等待态文案/动画切换时机、首字前 UI 没有可信反馈（而不是绝对 TTFT）

### 6) 快速验证方式

- **本地手测**：
  - 打开 `/play`，发送 5 次短指令 + 5 次长指令（含慢车道触发）。
  - 在 DB `analytics_events` 查询：
    - `event_name='chat_client_perf'` + `payload->>'requestId'`
    - `event_name='chat_request_finished'` + `payload->'serverPerf'`
  - 用 `requestId` 关联同一回合的 client/server 事件。

### 2026-05 backend TTFT guard update

This update keeps the `/api/chat` SSE and final DM JSON contract unchanged, but
tightens the player-facing long tail:

- `AI_PLAYER_CHAT_TIMEOUTS_V2=0` rolls back to the legacy 60s upstream attempt timeout.
- `AI_PLAYER_CHAT_FASTLANE_TIMEOUT_MS` defaults to `18000`.
- `AI_PLAYER_CHAT_SLOWLANE_TIMEOUT_MS` defaults to `45000`.
- `AI_PLAYER_CHAT_STREAM_RECONNECT_WALL_MS` defaults to `3500` so empty/broken stream repair cannot push first-visible text beyond the live p95 budget; set an explicit larger value to roll back.
- `VC_OPTIONS_ONLY_SERVER_BUDGET_MS` defaults to `16000` for options/decision repair chains only.
- `VC_FINAL_REPAIR_BUDGET_MS` defaults to `2000` for all final options/decision repair calls in one turn.
- `AI_PLAYER_CHAT_MERGE_EXTRA_BODY=1` and `AI_PLAYER_CHAT_EXTRA_BODY_JSON` allow player-chat-only gateway body hints, for example provider-specific "disable thinking" switches. It is opt-in because unsupported providers may reject unknown fields.
- `AI_CONTROL_PREFLIGHT_BUDGET_MS` defaults to `260`. A miss degrades the control preflight to unavailable and continues to the main stream; set `0` to roll back to the legacy full wait.

The repair-chain budget does not synthesize visible narrative or template options.
If the model does not return valid JSON inside the deadline, callers keep the
existing safe failure path and the main `PLAYER_CHAT` chain remains separate.

`pnpm benchmark:chat-metrics` now supports live percentile probes:

```powershell
$env:E2E_AI_LIVE='1'
$env:BENCHMARK_BASE_URL='http://localhost:666'
$env:BENCHMARK_CHAT_RUNS='10'
pnpm benchmark:chat-metrics
```

The live summary prints p50/p95 for `firstStatusMs`, `firstTokenMs`, `finalMs`,
and `statusFrames`. Use `BENCHMARK_CHAT_ENFORCE=1` to make the script exit
non-zero when the live budget fails.

### 2026-05 upstream TTFT probe

当 `/api/chat` 的 `firstStatusMs` 正常但 `firstTokenMs` 超预算时，先不要裁剪叙事内容，也不要把 DB / lore / safety 直接判为根因。使用独立 gateway probe 直接请求 `AI_GATEWAY_BASE_URL` 的 OpenAI-compatible stream：

```powershell
pnpm probe:ai-gateway -- --runs 10 --prompt-profile app-sized --json-out .runtime-data\gateway-ttft-probe-app-sized.json
```

关键输出：

- `gatewayHeadersMs`：gateway 返回 HTTP headers 的时间。
- `gatewayFirstTokenMs`：首个 `choices[0].delta.content` 出现时间。
- `gatewayFinalMs`：stream 完成时间。
- `chunkCount` / `finishReason`：确认是否真流式、是否 `length` 截断。

2026-05-04 本地排查结论：

- 小 prompt 直连 `vc-main`：`gatewayFirstTokenMs p50/p95=1841/3335ms`。
- app-sized prompt（`stableCharLen≈8502`、`dynamicCharLen≈5200`）直连 `vc-main`：`gatewayFirstTokenMs p50/p95=3768/9307ms`。
- 同一 app-sized prompt 加 `AI_PLAYER_CHAT_EXTRA_BODY_JSON={"enable_thinking":false,"thinking":{"type":"disabled"}}`：`gatewayFirstTokenMs p50/p95=1072/1419ms`。
- 对应 `/api/chat` live benchmark 在同配置下：`firstStatusMs p50/p95=318/418ms`，`firstTokenMs p50/p95=1386/1600ms`，`finalMs p50/p95=7686/9173ms`，`finalFrames=10/10`。

因此普通 benchmark 的根因不是 `/api/chat` 首字前 DB/lore/safety 阻塞，也不是 role chain / retry 放大；服务端日志中 `moderateInputOnServerMs`、`promptBuildMs` 等本地阶段为毫秒级，`ai.telemetry phase=success` 约 1s 返回 headers，但 `stream_first_token` 在未禁用 thinking 时被模型首正文前推理显著拖长。

浏览器长行动复测还暴露了另一个 tail：`PLAYER_CONTROL_PREFLIGHT` 在首包前等待 5s 以上，导致 `/api/chat` response headers/status frame 延迟。修复方式是启用默认 `AI_CONTROL_PREFLIGHT_BUDGET_MS=260` 的预算化放行；这不是安全审查降级，输入安全、主叙事规则、post-generation validation、NPC consistency 与 `__VERSECRAFT_FINAL__` 收口仍照常执行。

推荐部署配置（provider 支持时）：

```env
AI_PLAYER_CHAT_MERGE_EXTRA_BODY=1
AI_PLAYER_CHAT_EXTRA_BODY_JSON={"enable_thinking":false,"thinking":{"type":"disabled"}}
```

回滚方式：

```env
AI_PLAYER_CHAT_MERGE_EXTRA_BODY=0
# 或删除 AI_PLAYER_CHAT_EXTRA_BODY_JSON
```

注意：这是 PLAYER_CHAT 专用网关 body hint，不改变 `/api/chat` SSE 契约，不改变 `__VERSECRAFT_FINAL__` 收口，不让 `reasoner` 进入主链路，也不通过缩短 narrative 伪造达标。若 provider 不支持这些字段并返回 4xx，应回滚该 env，改在 one-api 渠道或模型配置层选择默认关闭 thinking 的在线叙事模型。
