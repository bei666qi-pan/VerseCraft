## VerseCraft 专项：等待体验与真实延迟优化施工图（低风险版）

目标：围绕**“玩家等待大模型回复期间的体验”**与**“真实回复速度”**做一次企业级、可落地、低风险的专项优化规划。

硬约束（本设计与本阶段落地均严格遵守）：

- **不影响主要功能**、不破坏玩家体验、不改变核心 UI 风格
- **不改 SSE 基本契约**（仍以 `text/event-stream`，`data:` 帧 + `__VERSECRAFT_STATUS__` / `__VERSECRAFT_FINAL__` 控制帧为主）
- **不删现有 TTFT/stream/status 基础设施**
- **本阶段不做大规模逻辑改动**：只做“真实链路摸底 + 低风险重构规划 + 常量收敛/注释/挂点”

本仓库已具备的基础设施（继续在其上优化，不推倒重来）：

- `/api/chat`：已有 TTFT 分段计时、budget cap、risk lane、prompt slimming、status frames
- 前端：已有 `streamPhase`、`usePlayWaitUx`、`useSmoothStreamFromRef`
- `logicalTasks.ts`：已有 `generateOptionsOnlyFallback`
- `execute.ts`：已有路由链、重试、circuit、短 JSON 任务优化
- `page.tsx`：已有首包/流式 stall timeout、开场 fallback、选项补救链

---

## 三类优化目标（必须分开看）

### A. 真实延迟优化（Real latency）

目标：降低“点击发送 → 首字可见/首 token 到达”的真实耗时，尤其是 p95/p99。

典型手段：

- 减少首字前同步阻塞步骤（或并行化）
- 降低上游连接耗时 / 减少重试导致的尾部延迟
- 缓存、降级、快慢车道更激进但安全的短路（需要严格灰度）

### B. 感知延迟优化（Perceived latency）

目标：即使真实 TTFT 不变，也让玩家更快感到“系统在可靠地工作、没卡死”，减少焦虑与误触。

典型手段：

- 更可信的等待态推进与语义提示（不乱跳、不撒谎）
- 首屏反馈更早出现（status frame / 微反馈 / 动画节奏）

### C. 流式平滑度优化（Streaming smoothness）

目标：首 token 后避免“断续感/忽快忽慢/看起来比实际慢”，减少长停顿感知。

典型手段：

- 优化前端打字机/分块/标点停顿策略
- 对上游 chunk 间隔做 UI 侧的“平滑呈现”与“长停顿识别”

---

## 真实首字前阻塞链路（Server → Network → Client）

以下链路按真实代码顺序梳理（首字前阻塞=客户端拿不到任何正文可见字符；即便 status frame 先到，也属于“感知首字前反馈”，但不等于正文首字）。

### 0) 客户端起点（`src/app/play/page.tsx`）

- `sendAction()` 进入后立刻：
  - `setStreamPhase("waiting_upstream")`
  - `setWaitUxStartedAt(performance.now())`
  - `setWaitingHintKind(guessSemanticWaitingKind(trimmed))`
- 发起 `fetch("/api/chat")`，并设置“**响应头/首字节 deadline**”：
  - `FETCH_CHAT_RESPONSE_DEADLINE_MS`（现收敛为 `VC_WAITING.playFetchChatResponseDeadlineMs`）

**首字前真实阻塞的客户端观测边界**：

- 如果 `fetch` 迟迟拿不到 response headers，会触发 deadline abort（这是“连本服务端首包都没回来”）。
- 如果 headers 回来了但 SSE 迟迟没有任何非空 `data:`，会落到“first chunk stall”（见下文）。

### 1) 服务端 POST 入口（`src/app/api/chat/route.ts`）

首字前同步阻塞段（TTFT 画像已在本文件维护，且在 dev 会输出聚合）：

- `req.json()` → `ttftProfile.jsonParseMs`
- `validateChatRequest()` → `ttftProfile.validateChatRequestMs`
- `auth()` → `ttftProfile.authSessionMs`
- `moderateInputOnServer()` → `ttftProfile.moderateInputOnServerMs`
- slow lane 才有 `preInputModeration()` → `ttftProfile.preInputModerationMs`
- `session memory` 读取：`loadSessionMemoryForUser()` + `Promise.race` budget cap
  - cap 由 `TTFT_HARD_CAP_SESSION_MEMORY_MS`（140ms）硬限制
  - 超预算直接降级为 `null`，避免 DB 抖动放大 TTFT

**关键点**：首字前是可以“阶段化”推进的（status frame），但仍要明确哪些步骤是不可避免的真实阻塞。

### 2) 首次 SSE 写入点（`route.ts`）

服务端把首字前阻塞的“玩家可感知时刻”统一锚定在：

- `writeToStream()` 首次调用时写入 `ttftProfile.firstSseWriteAt`

同时 status frame 的写入使用：

- `writeStatusFrame()` → `__VERSECRAFT_STATUS__:{stage,message,...}`
- 注意：当前实现把第一次状态写入固定为 `request_sent`（“行动已送出”），发生在后台异步 IIFE 的开头：
  - `await writeStatusFrame("request_sent", "行动已送出")`

这意味着：

- **“感知首反馈”**可以在正文首 token 前出现（status frame）
- **“正文首字可见”**还要看：上游首 token 到达、前端 `useSmoothStreamFromRef` 渲染节奏等

### 3) 上游连接与重试（`src/lib/ai/router/execute.ts` + `route.ts`）

主叙事 SSE 走 `generateMainReply()` → `executePlayerChatStream()`：

- `resilientFetch(url, init, { timeoutMs, maxRetries, ... })`
- `maxRetries` 受 `env.playerChatMaxRetries` 控制
- role chain + circuit：
  - `resolveFallbackPolicy("PLAYER_CHAT", env, mode)` 决定候选链
  - `isCircuitOpen` / `isModelCircuitOpen` 可能跳过（减少尾部延迟，但也可能增加“链耗尽”）

对 TTFT 的影响：

- `timeoutMs`（任务级超时）× `maxRetries`（重试次数）是 p99 的放大器
- `execute.ts` 的 retry 发生在“连接上游”阶段，属于 TTFT 的大头之一（`route.ts` 的 `upstreamConnectMs`）

---

## 首字后但感知仍慢的链路（首 token 已到，但看起来慢）

这类问题要区分“上游真的慢/停顿”与“前端节奏造成的慢”。

### 1) SSE chunk 间隔导致的停顿（`page.tsx`）

`sendAction()` 的读循环对 stall 做了两段守卫：

- **首 chunk stall**：`STREAM_FIRST_CHUNK_STALL_MS`（现收敛为 `VC_WAITING.playStreamFirstChunkStallMs`）
- **后续 chunk stall**：`STREAM_CHUNK_STALL_MS`（现收敛为 `VC_WAITING.playStreamChunkStallMs`）

这解决的是“卡死不收敛”的体验问题，但它不是加速；它只是定义了“什么时候放弃等待并提示用户”。

### 2) 视觉打字机导致的“看起来慢”（`src/hooks/useSmoothStream.ts`）

`useSmoothStreamFromRef` 的展示策略是“网络 ingestion 与 React 渲染解耦”：

- `narrativeRef` 持续累积
- rAF loop 把 queue 按语义 chunk 逐步吐出
- 初期 burst / steady / backlog catch-up / punctuation pause 四阶段策略

潜在的“感知慢”来源（不等于真实慢）：

- 标点停顿（`computePauseMs`）在中文叙事里可能频繁触发，导致“断续感”
- backlog 阈值（`backlogThreshold`）过高时，UI 会坚持稳态小块吐出，显得慢于实际接收
- `adjustChunkBoundaryForMarkers` 避免分割 `**` / `^^` 的策略是正确的，但在高频 marker 的文本里会减少可见吞吐

### 3) 等待态可信度（`src/hooks/usePlayWaitUx.ts` + status frames）

等待态由两路信息驱动：

- 前端：`thinking` + `requestStartedAt` + 定时 tick（160ms）
- 后端：SSE `__VERSECRAFT_STATUS__` 控制帧，经 `parseBackendWaitStage()` 更新 `backendStageRef`

当前显示逻辑：

- `usePlayWaitUx` 仅在 `thinking` 且 `requestStartedAt` 非空时启用
- semantic subline（基于 `guessSemanticWaitingKind`）在 **>=2200ms** 才出现（现收敛为 `VC_WAITING.playWaitUxSemanticSublineAfterMs`）

潜在问题：

- `request_sent` 是“单帧开局”，之后如果后端 status frame 更新不够及时，前端容易在同一主文案上停留过久（感知上“像卡住”）

---

## 纯感知问题 vs 真实耗时问题：边界定义

建议统一使用以下边界（与 `docs/perf-ttft-diagnostics.md` 一致）：

- **真实耗时问题**：`firstChunkReceivedMs` / `responseHeadersMs` / 服务端 `serverPerf.*` 高
- **纯感知问题**：`firstPerceivedFeedbackMs` 已低，但用户仍觉得慢
  - 常见原因：等待文案推进不可信、视觉节奏导致首屏慢、长句分块太碎

判定方法（建议后续阶段落到数据看板/日志关联）：

- TTFT 低但抱怨慢 → 优先做 B/C
- TTFT 高且 `upstreamConnectMs` 高 → 优先做 A（execute/上游侧）
- TTFT 高且 `moderateInputOnServerMs` / `preInputModerationMs` 高 → A（安全链路并发/缓存/车道）
- TTFT 高且 `sessionMemoryReadMs` 高 → A（DB/预算/并行）

---

## 当前仓库中“最值得动手”的 10 个点（按风险/收益综合）

说明：这里只列“动手点”，并明确它更偏向 A/B/C 哪类目标；真正落地要走灰度与回滚预案。

1) **（A）上游连接与重试的尾部延迟治理**
   - 位置：`src/lib/ai/router/execute.ts`（`resilientFetch` + `maxRetries` + role chain）
   - 收益：直接影响 p95/p99 TTFT
   - 风险：中（涉及重试策略，必须谨慎）

2) **（A）快慢车道下首字前安全链路的并行/短路**
   - 位置：`src/app/api/chat/route.ts`（`classifyChatRiskLane`、`preInputModeration`、`moderateInputOnServer`）
   - 收益：fast lane 明显降低首字前阻塞
   - 风险：高（安全相关必须严格灰度、证据驱动）

3) **（A）TTFT budget cap 的“可观测 + 可调参 + 灰度”**
   - 位置：`route.ts` 的 `TTFT_HARD_CAP_*` 与 `resolveChatPerfFlags()`
   - 收益：把 DB/lore/preflight 抖动限制在可控范围
   - 风险：中（预算过小会影响质量）

4) **（A）session memory 读取策略进一步工程化**
   - 位置：`route.ts` 的 `loadSessionMemoryForUser()` + `Promise.race` budget
   - 收益：减少首字前 DB 放大
   - 风险：低~中（需确认降级品质）

5) **（A）options-only/decision-only 补救链路的“更快失败”与“更少二次等待”**
   - 位置：`src/lib/ai/logicalTasks.ts` 的 `generateOptionsOnlyFallback` / `generateDecisionOptionsOnlyFallback`
   - 收益：减少“无选项 → 再等一次”的平均等待
   - 风险：中（会影响玩法连贯，需谨慎）

6) **（B）等待态推进可信度（减少“卡住感”）**
   - 位置：`usePlayWaitUx.ts` + `route.ts` 的 `writeStatusFrame`
   - 收益：不改真实耗时也能显著减投诉
   - 风险：低（展示层）

7) **（C）流式平滑策略的 profile 化（对不同文本风格选择不同 pacing）**
   - 位置：`useSmoothStream.ts`
   - 收益：减少“看起来慢于实际”
   - 风险：低~中（展示层，但容易引起主观争议）

8) **（C）首屏吐字策略：首 token 后更快显示“足够意义的片段”**
   - 位置：`useSmoothStreamFromRef` 的 initial burst / whitespace trim
   - 收益：TTFV 降低（首个可见字符）
   - 风险：低（展示层）

9) **（B/C）客户端 stall 的精细化提示与回退策略**
   - 位置：`page.tsx` 的 `STREAM_STALL_TIMEOUT` 分支
   - 收益：减少“无反馈”与“误判卡死”
   - 风险：低（文案/提示）

10) **（A）首字前 prompt build 的 CPU/字符串拼装热点**
   - 位置：`route.ts`（system packet / runtime packets / lore merge 等）
   - 收益：降低服务端 CPU 型 TTFT
   - 风险：中（提示词结构相关，需要保持契约）

---

## 哪些点绝不能动（本阶段 & 后续也要谨慎）

以下变更会显著伤害稳定性或玩法一致性，本阶段明确禁止：

- **删除或改写 SSE 契约**：`__VERSECRAFT_STATUS__` / `__VERSECRAFT_FINAL__` 的 framing 与含义
- **改动主链路“玩法权威裁决”**：客户端不得“脑补 DM 结构”或改写提交规则（`page.tsx` 的注释已明确 fail-closed）
- **削弱安全审查**：`moderateInputOnServer` / `preInputModeration` / 风控与审计链路
- **移除或弱化路由链/重试/circuit**（`execute.ts`）：会导致可用性下降或雪崩
- **改变 prompt slimming / risk lane 的核心规则**：必须有数据、灰度、回滚
- **把 options-only 补救并入主 PLAYER_CHAT 链路**：会拉长主链路、污染 TTFT 目标

---

## 当前问题清单（必须点名到具体实现位置）

### `/api/chat`（`src/app/api/chat/route.ts`）

- **首字前可能阻塞过久的步骤**
  - `auth()`：同步等待（`ttftProfile.authSessionMs`）
  - `moderateInputOnServer()`：输入安全审核是必经（`ttftProfile.moderateInputOnServerMs`）
  - slow lane 的 `preInputModeration()`：额外阻塞（`ttftProfile.preInputModerationMs`）
  - `loadSessionMemoryForUser()`：虽有 140ms cap，但 DB 抖动仍可能造成主线程等待（尤其是 `auth`/安全/DB 叠加时）
  - 生成主流前的“context build/prompt build/lore/preflight”等阶段：最终会进入 `promptBuildMs` 等画像（需结合 `serverPerf` 事件与 `ttft_profile` 日志定位）

- **status frame 的时机与阶段覆盖**
  - `writeStatusFrame("request_sent", "行动已送出")` 固定只写一次“开局帧”
  - 如果后续阶段帧不足/不均匀，前端等待态会显得“没在推进”

### `execute.ts`（`src/lib/ai/router/execute.ts`）

- **retry/fallback 行为会拉长平均等待**
  - `resilientFetch(... maxRetries ...)` 对 TTFT 的尾部影响大：一旦上游不稳定，重试会把等待时间推到分钟级
  - role chain fallback：链越长、重试越多，平均与尾部等待越长（需要做“更聪明的短路”与“更强的观测”）

- **对短 JSON 任务与主流任务的差异**
  - `ONLINE_SHORT_JSON_TASKS` 用更小的 `onlineShortJsonMaxRetries`
  - 但主 PLAYER_CHAT 的 `playerChatMaxRetries` 仍是 p99 放大器，需要策略化治理（后续阶段）

### `logicalTasks.ts`（`src/lib/ai/logicalTasks.ts`）

- **options-only 补救仍可能造成额外等待**
  - `generateOptionsOnlyFallback()` 两次 `runOptionsOnlyAiOnce()`：9s timeout × 2（虽相对短，但在“主回合 options 缺失”场景会造成二次等待）
  - `generateDecisionOptionsOnlyFallback()` 同理
  - 当前已经有“第二次失败就硬兜底四条/两条”的策略，但“二次调用”的发生频率与触发条件仍值得审计与优化（后续阶段）

### `page.tsx`（`src/app/play/page.tsx`）

- **状态切换/timeout 可能过于保守**
  - `FETCH_CHAT_RESPONSE_DEADLINE_MS=280_000`：对慢链路友好，但会让“真的卡死”的反馈很晚（需更细分：headers vs first status vs first chunk）
  - `STREAM_FIRST_CHUNK_STALL_MS=45_000`：连接已建立但无 chunk 时，玩家可能已经焦虑；可结合 status frames 更早给出可信解释（后续阶段偏 B）

- **首字后 stall 与错误兜底**
  - `STREAM_CHUNK_STALL_MS=120_000`：两分钟无 chunk 才报错，对“上游停顿”容忍度高；但如果 UI 没有持续可信推进，会显得“卡死”

### `useSmoothStream.ts`（`src/hooks/useSmoothStream.ts`）

- **节奏可能让正文看起来慢于实际**
  - `computePauseMs()` 的标点停顿策略在中文叙事密集标点时容易造成“断续慢”
  - `takeSemanticChunk()` 的 chunk 边界偏保守时，会导致首屏吐字慢（尤其在 backlog 未触发 catch-up 前）

### `usePlayWaitUx.ts`（`src/hooks/usePlayWaitUx.ts`）

- **文案推进还不够“可信”**
  - tick=160ms + `advanceWaitUxDisplay` 的推进规则依赖后端 stage 更新；当后端 stage 覆盖不足时，UI 会停在同一个阶段过久
  - semantic subline 2200ms 才出现是“稳定优先”的保守策略，但在 fast lane 的短请求里可能永远看不到“解释”，导致等待态显得单薄（后续可做自适应）

---

## 后续阶段拆分（建议）

### Phase 1（低风险展示层 + 观测增强）

- B/C 为主：等待态文案推进、首屏反馈、流式平滑 profile
- 增强 client perf 事件（与 `docs/perf-ttft-diagnostics.md` 对齐）
- 输出：等待体验显著改善；真实延迟不一定变，但投诉下降

### Phase 2（服务端首字前并行化与预算治理）

- A 为主：并行化可并行的 DB/上下文构建，严格 budget cap + 灰度
- 目标：降低 TTFT p95/p99，且不伤稳定性

### Phase 3（上游重试/路由链治理）

- A 为主：根据失败类型/历史观测做更聪明的短路与限流
- 目标：削尾部延迟、减少“分钟级等待”

---

## 本阶段已完成的低风险落地（不改行为）

- 已把散落在多个文件中的等待/超时常量收敛到单一入口：
  - `src/lib/perf/waitingConfig.ts`
  - 并在 `page.tsx`、`usePlayWaitUx.ts`、`logicalTasks.ts` 中改为引用该入口（数值保持一致）

---

## 当前真实性能瓶颈地图（按链路阶段）

按“首字前 → 首字后”划分（与仓库的 TTFT 画像字段一致）：

- **首字前（Server blocking）**
  - validate / auth / input safety / pre_input (slow lane) / quota / session_memory / control_preflight / lore / prompt_build
  - 上游连接（execute.ts 的 resilientFetch + retry）是 TTFT 最大不确定性来源

- **首字后（Upstream pacing + client rendering）**
  - 上游 chunk 间隔（网络/模型端停顿）
  - 前端 `useSmoothStreamFromRef` 的吐字策略与标点停顿（感知慢）
  - 客户端 stall guard（45s/120s）决定“何时放弃等待并提示”

