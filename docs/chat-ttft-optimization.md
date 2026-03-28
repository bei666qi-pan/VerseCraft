# Chat TTFT 与等待体验优化收口

本文是 `/api/chat` 链路在“首字延迟 + 等待体验 + 流式顺滑”上的收口文档，目标是：

- 可灰度
- 可回滚
- 可量化收益
- 不破坏 `__VERSECRAFT_FINAL__` 与现有数据契约

## 1. 现状问题与改造点

### 1.1 现状问题

- 首字前链路包含多段预算化步骤，仍可能被长尾放大（上游连接、控制预检、lore、prompt 构建）。
- 前端在首字前“知道在等”，但历史上存在空白等待或机械感。
- 流式正文在弱网/上游抖动时可能出现：长停顿后突发、或碎片化过强。

### 1.2 已落地改造（按层）

- **后端链路**：快慢车道、预算上限、首字前可并行步骤、状态帧（`__VERSECRAFT_STATUS__`）。
- **模型路由**：在线短 JSON 任务更快失败、PLAYER_CHAT 候选链收敛、reasoner 禁入在线首响链路。
- **前端体验**：等待状态机、状态文案节奏、流式语义平滑、中途长 gap 轻提示、终帧平滑收束。
- **诊断能力**：统一 `requestId` 贯穿 client/server；`chat_request_finished` + `chat_client_perf` 可联表。

## 2. Feature Flags（默认与回滚）

### 2.1 后端（`AI_*`）

- `AI_CHAT_ENABLE_DIAGNOSTICS`（默认：dev=1/prod=0）
  - 启用 serverPerf 细分字段写入 `chat_request_finished.payload.serverPerf`
  - 回滚：设 `0`
- `AI_CHAT_ENABLE_STATUS_FRAMES`（默认：1）
  - 是否发送 `__VERSECRAFT_STATUS__:{...}`
  - 回滚：设 `0`
- `AI_CHAT_ENABLE_RISK_LANE_SPLIT`（默认：1）
- `AI_CHAT_ENABLE_LIGHTWEIGHT_FAST_PATH`（默认：1）
- `AI_CHAT_ENABLE_PROMPT_SLIMMING`（默认：1）
- `AI_CHAT_FASTLANE_SKIP_RUNTIME_PACKETS`（默认：1）
- `AI_CHAT_TIERED_CONTEXT_BUILD`（默认：1）
- `AI_CHAT_CONTROL_PREFLIGHT_BUDGET_MS_CAP`（默认：260）
- `AI_CHAT_LORE_RETRIEVAL_BUDGET_MS_CAP`（默认：220）

### 2.2 路由与在线 JSON 任务（`AI_*`）

- `AI_PLAYER_CHAT_STREAM_INCLUDE_USAGE`（默认：1）
- `AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES`（默认：2）
- `AI_PLAYER_CHAT_MAX_RETRIES`（默认：继承 `AI_MAX_RETRIES`，建议灰度设为 1）
- `AI_ONLINE_SHORT_JSON_MAX_RETRIES`（默认：0）
- `AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT`（默认：1）
- `AI_ONLINE_SHORT_JSON_DISABLE_MAIN_FALLBACK`（默认：1）

### 2.3 前端（`NEXT_PUBLIC_*`）

- `NEXT_PUBLIC_CHAT_WAITING_UX`（默认：1）
  - 等待状态机 + 状态文案接入
- `NEXT_PUBLIC_CHAT_STREAM_SMOOTHING_V2`（默认：1）
  - 语义断点平滑（非匀速逐字）
- `NEXT_PUBLIC_CHAT_DIAGNOSTICS`（默认：1，建议仅 dev/staging）
  - 前端链路指标上报

## 3. 指标体系（可聚合）

### 3.1 服务端（`chat_request_finished.payload`）

- `firstChunkLatencyMs`（TTFT）
- `totalLatencyMs`
- `streamReconnectCount`
- `streamInterruptedCount`
- `streamEmptyCount`
- `finalJsonParseSuccess`
- `aiFallbackCount`
- `fallbackRate`（0/1，派生）
- `emptyFirstChunkRate`（0/1，派生）
- `statusFrameCount`
- `statusShownRate`（0/1，派生）

### 3.2 客户端（`chat_client_perf.payload`）

- `firstPerceivedFeedbackMs`
- `firstStatusShownMs`
- `firstVisibleTextMs`
- `firstStatusToFirstTokenGapMs`
- `midstreamLongGapCount`（同 `longGapCount`）
- `statusFrameCount`（客户端收到的状态帧数）
- `statusShownRate`（0/1）
- `userCancelRate`（0/1）
- `interruptRate`（0/1）
- `totalClientWallMs`

> 联动方式：使用 `requestId` / `serverRequestId` 对齐同一回合的 client+server 事件。

## 4. A/B 与灰度策略

推荐分两层灰度：

1. **服务端功能灰度**
   - 先灰度 `AI_CHAT_ENABLE_STATUS_FRAMES`、`AI_PLAYER_CHAT_MAX_RETRIES`、`AI_ONLINE_SHORT_JSON_*`
   - 观察 TTFT 与 fallback/empty 指标
2. **前端体验灰度**
   - 再灰度 `NEXT_PUBLIC_CHAT_WAITING_UX`、`NEXT_PUBLIC_CHAT_STREAM_SMOOTHING_V2`
   - 观察 `firstPerceivedFeedbackMs`、`firstVisibleTextMs`、`midstreamLongGapCount`

建议按环境推进：

- `dev`：全开（便于调试）
- `staging`：50% 试验（通过 env 组合）
- `prod`：先 10%→30%→100%

## 5. 回滚策略

### 5.1 快速回滚（无代码回滚）

- 关闭状态帧：`AI_CHAT_ENABLE_STATUS_FRAMES=0`
- 关闭等待状态机：`NEXT_PUBLIC_CHAT_WAITING_UX=0`
- 回退旧平滑：`NEXT_PUBLIC_CHAT_STREAM_SMOOTHING_V2=0`
- 放宽路由收敛：
  - `AI_ONLINE_SHORT_JSON_DISABLE_MAIN_FALLBACK=0`
  - `AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT=0`
  - `AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES=0`
  - `AI_PLAYER_CHAT_MAX_RETRIES` 提高到历史值

### 5.2 触发回滚的建议阈值

- `firstChunkLatencyMs` p95 上升 > 15%
- `fallbackRate` 异常上升且 `success` 下降
- `finalJsonParseSuccess` 明显下降
- 用户侧 `interruptRate` 明显上升

## 6. 验证与回归

### 6.1 自动化测试

- `src/features/play/stream/sseFrame.test.ts`
  - 新增：状态帧可解析且不会污染 DM 累积
- `e2e/chat-sse-contract.spec.ts`
  - SSE 契约解析器忽略 `__VERSECRAFT_STATUS__`，确保旧契约不受影响
- `src/lib/analytics/chatRequestFinishedPayload.test.ts`
  - 覆盖新增派生指标字段（`fallbackRate`、`emptyFirstChunkRate`、`statusFrameCount` 等）

### 6.2 基准脚本

- `scripts/benchmark-chat-metrics.ts`
  - 扩展输出：
    - `firstStatusMs`
    - `firstTokenMs`
    - `finalMs`
    - `statusFrames`

## 7. 判定本轮是否成功

至少满足：

- TTFT：`firstChunkLatencyMs` p50/p95 下降
- 等待体验：`firstPerceivedFeedbackMs` 与 `firstStatusShownMs` 更稳定
- 流式顺滑：`midstreamLongGapCount` 不上升或下降
- 正确性：`finalJsonParseSuccess` 不下降，`__VERSECRAFT_FINAL__` 契约稳定

## 8. 下一轮架构级候选优化

1. **预检/检索的跨回合 warm cache 策略**（按 session 的轻量预热）
2. **按角色维度的 TTFT 自适应降权**（非错误也可基于高 TTFT 长尾降权）
3. **统一实验框架**（服务端+前端统一 variant 透传与自动报表）
4. **流式质量策略分层**（首段优先策略与后段细化策略解耦）

