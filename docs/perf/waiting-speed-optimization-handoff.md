## VerseCraft 等待/速度优化工程交接（可上线/可回滚/可观测）

本文是本轮（Phase 1–6）等待体验 + 回复速度优化的**工程闭环交接文档**，面向上线与回滚。

---

## 改造前的主要问题（真实链路）

- **首字前长等待**：`/api/chat` 在返回 SSE 之前会同步等待上游连接/重试，客户端容易出现“服务器无响应/假死”。
- **坏 upstream 拖累整轮**：同一轮内 retry + role chain 叠加，尾部延迟放大到分钟级。
- **补救链累加等待**：开场/自动补选项/decision fallback 等在坏情况下会反复触发，导致“等很久→再请求→再等很久”。
- **等待推进不够可信**：后端 status frame 不稳定时，前端会机械推进或停滞，用户感知“卡住”。
- **吐字节奏看起来慢**：中文标点密集时停顿过长、小 backlog 也显得拖。

---

## 改造内容概览（按目标分）

### A. 真实延迟优化

- **提前建立 SSE 通道**：服务端先返回 `text/event-stream`，并立刻写 `__VERSECRAFT_STATUS__`，再后台连接上游（减少“首字前无响应窗口”）。
- **更快失败/更快切换策略**：`executePlayerChatStream` 对 fast lane 0 retry、后续 role 0 retry；对 401/403、429 直接 fail-fast（可开关）。
- **预算化降级**：KG cache early hit 设置早期预算；miss 不阻塞首字。

### B. 感知延迟优化（等待体验）

- `usePlayWaitUx` 引入 client signals（headers/SSE/visible text），后端沉默也能平滑推进且不冒进。
- 开场与 options-only 补救改为更快进入“低成本兜底”，减少摇摆等待。

### C. 流式平滑度优化

- 调整 `useSmoothStreamFromRef` 的节奏参数；收敛中文标点停顿，减少“看起来慢于实际”的断续感。

---

## 关键代码入口（必看）

- **服务端主链路**：`src/app/api/chat/route.ts`
  - status frames 写入、SSE 早返回、reconnect 限制、`chat_request_finished` payload
- **上游路由/重试**：`src/lib/ai/router/execute.ts`
  - `executePlayerChatStream` retry/fail-fast/role chain 策略
- **短 JSON 补救工具**：`src/lib/ai/logicalTasks.ts`
  - `generateOptionsOnlyFallback` / `generateDecisionOptionsOnlyFallback` 的预算化兜底
- **前端等待/吐字/补救链**：`src/app/play/page.tsx`、`src/hooks/usePlayWaitUx.ts`、`src/hooks/useSmoothStream.ts`

---

## Feature flags（可独立开关、可快速回退）

### 客户端（`NEXT_PUBLIC_*`）

这些开关集中在 `src/lib/perf/waitingConfig.ts` 的 `VC_PERF_FLAGS`：

- `NEXT_PUBLIC_VC_WAIT_UX_V2`（默认开）
  - **作用**：启用等待时间线 V2（后端 stage + client signals）
  - **回滚**：置 `0` 退回旧推进逻辑
- `NEXT_PUBLIC_VC_SMOOTH_STREAM_V2`（默认开）
  - **作用**：启用新吐字策略参数（更自然稳定）
  - **回滚**：置 `0` 回到匀速吐字（uniform pacing）
- `NEXT_PUBLIC_VC_TIGHT_TIMEOUTS`（默认开）
  - **作用**：收紧 headers/first-chunk/chunk stall timeout
  - **回滚**：置 `0` 回到旧的保守超时（280s/45s/120s）
- `NEXT_PUBLIC_VC_OPENING_FAST_FALLBACK`（默认开）
  - **作用**：开场超时后优先走 options-only 兜底（不再重发开场主链路）
  - **回滚**：置 `0` 回到“重发开场请求”
- `NEXT_PUBLIC_VC_OPTIONS_ONLY_DEADLINE`（默认开）
  - **作用**：options-only 补救加 deadline + 早解析，避免长等
  - **回滚**：置 `0` 回到旧行为
- `NEXT_PUBLIC_VC_MODE_SWITCH_COOLDOWN`（默认开）
  - **作用**：mode switch 自动补选项限频
  - **回滚**：置 `0` 取消限频

### 服务端（`AI_*`）

这些开关集中在 `src/lib/ai/config/envCore.ts` 的 `ResolvedAiEnv`：

- `AI_PLAYER_CHAT_AGGRESSIVE_FAILOVER`（默认开）
  - **作用**：启用“更快失败/更快切换”的 player stream 策略
- `AI_PLAYER_CHAT_FASTLANE_ZERO_RETRY`（默认开）
  - **作用**：fast lane 每 role 0 retry
- `AI_PLAYER_CHAT_FAILFAST_AUTH`（默认开）
  - **作用**：401/403 直接 fail-fast（不切 role）
- `AI_PLAYER_CHAT_FAILFAST_RATELIMIT`（默认开）
  - **作用**：429 直接 fail-fast（不切 role）
- `AI_ONLINE_SHORT_JSON_RETRY_HARDCAP_1`（默认开）
  - **作用**：在线短 JSON 任务 retry 硬上限 1（避免补救链拖长）

- `AI_CHAT_ENABLE_KG_CACHE_EARLY_BUDGET`（默认开）
  - **作用**：KG 全局缓存早期查询设置 42ms 预算，miss 不阻塞 TTFT
- `AI_CHAT_ENABLE_STREAM_RECONNECT_LIMITS`（默认开）
  - **作用**：限制 reconnect（总轮数/同类失败次数/总墙钟），避免极端长等待放大

---

## 如何观察是否真的变快（验收指标）

复用既有事件：

- **服务端**：`chat_request_finished`（`payload.firstChunkLatencyMs`、`payload.totalLatencyMs`、`payload.riskLane`、`payload.aiFallbackCount`、`payload.streamReconnectCount`、`payload.statusFrameCount`）
- **客户端**：`chat_client_perf`（`firstPerceivedFeedbackMs`、`responseHeadersMs`、`firstChunkReceivedMs`、`firstVisibleTextMs`、`maxInterChunkGapMs/longGapCount`）
- **路由侧**：`ai.telemetry`（`phase=error/success/stream_first_token/preflight_budget/...`）
- **聚合**：dev 控制台 `ttft_aggregate`（avg/p95 + slowestStage）

建议上线后看板/查询维度：

- `riskLane=fast/slow` 的 `firstChunkLatencyMs` 分布（均值/p95/p99）
- `chat_client_perf.firstPerceivedFeedbackMs` 与 `firstVisibleTextMs` 分布
- `aiFallbackCount`、`streamReconnectCount` 的触发率
- options/decision 补救链（见 `page.tsx` 的触发源日志 + `chat_client_perf` 事件）

---

## 如何回滚（最短路径）

1) **仅回滚等待体验**：关闭 `NEXT_PUBLIC_VC_WAIT_UX_V2`、`NEXT_PUBLIC_VC_SMOOTH_STREAM_V2`
2) **仅回滚 timeout 收紧**：关闭 `NEXT_PUBLIC_VC_TIGHT_TIMEOUTS`
3) **仅回滚开场快速兜底**：关闭 `NEXT_PUBLIC_VC_OPENING_FAST_FALLBACK`
4) **仅回滚 options-only 工具化策略**：关闭 `NEXT_PUBLIC_VC_OPTIONS_ONLY_DEADLINE`
5) **仅回滚上游 fail-fast/重试策略**：关闭 `AI_PLAYER_CHAT_AGGRESSIVE_FAILOVER`（或分别关闭 AUTH/RATE_LIMIT/FASTLANE 子开关）

---

## 已知风险（需重点监控）

- **timeout 收紧误杀**：慢网络或本机性能差可能更容易触发 stall；需看 `chat_client_perf` 的 abort/提示比例。
- **fail-fast 可能提高“降级返回”比例**：上游短暂 429/鉴权抖动时会更快失败，需看 `chat_request_finished.success=false`。
- **开场快速兜底可能导致“首轮无正文但有选项”**：这是产品策略变化，需确认玩家理解（现通过文案提示尽量降低困惑）。

---

## 下一轮最值得继续优化的三件事

1) 把补救链（opening/auto_missing_main/auto_switch/manual）的触发源与结果 **结构化写入** `chat_client_perf`，做真实频率治理。
2) 对 `finalizing`（终帧后处理）单独计时并上报，定位“正文结束但仍等待”的长尾。
3) 服务端 prompt 分层（core/optional/late-attach）进一步工程化，把“质量增强块”彻底非首字化。

