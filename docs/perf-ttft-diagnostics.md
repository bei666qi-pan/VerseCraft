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

