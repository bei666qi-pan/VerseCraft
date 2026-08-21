## Why

VerseCraft 当前 Responses 通道（`src/lib/ai/gateway/openaiResponses.ts`）已经在协议层实现真原生 SSE 流式（`response.output_text.delta` 事件），并通过 `src/lib/ai/stream/responsesLike.ts` 的 `responsesToChatCompletionsTransform` 转成 Chat Completions 帧。但代码注释（`openaiResponses.ts:60-67`）把"Ark agent-plan minimax-m3 在 streaming+thinking:disabled+json_object 这个特定组合下产出不可用"误表述为"Responses 通道没有真原生流式"，导致三方面问题：

1. **代码注释与协议层实现状态不一致**——文档让阅读者误判通道能力边界。
2. **PLAYER_CHAT 在线主链路（`/api/chat`）只走 Chat Completions 通道的 `submit_player_turn` strict function tool**（`usePlayerTurnTerminalTool` 三元表达式，依赖 `body.tools.length === 0` 才强制追加 `submit_player_turn`），无法用 Responses 通道的流式 + 工具调用。
3. **`openaiResponses.ts:88-90` 明确注释"Tools are not used in the realtime player turn"**——这把 Responses 通道的 strict function tool 能力关在了 PLAYER_CHAT 门外，违背"工具不绑定单一 transport"的 vendor-neutral 原则。

需要：(A) 把代码层注释 / AGENTS.md 同步成"Responses 协议层支持流式、Ark 在特定组合下走降级"的真实状态；(B) 加契约测试覆盖 `responsesToChatCompletionsTransform` 的真流式转换和 Ark 降级路径；(C) 让 PLAYER_CHAT 在线主链路在 Responses 通道下也能用 `submit_player_turn` strict function tool + 真原生 SSE 流式，**保持现有 SSE / `__VERSECRAFT_FINAL__` / status 帧 / DM JSON 契约不破**，并把"Ark 不可用组合"的降级路径完整接通。

## What Changes

### A. 文档 / 注释同步（纯文字）

- `src/lib/ai/gateway/openaiResponses.ts:1-14` 文件头注释：补"Responses API 协议层流式事件 + `responsesLike.ts` 真流式转换器"现状。
- `src/lib/ai/gateway/openaiResponses.ts:60-67`：把"non-DM-JSON narrative deltas under streaming+thinking:disabled+json_object"那段重写，明确"协议层支持流式；该段特指 Ark agent-plan minimax-m3 在该特定组合下产出不可用时，调用方走 `nonStreamResponsesToChatCompletionsStream` 降级"。
- `src/lib/ai/gateway/openaiResponses.ts:88-90` "Tools are not used in the realtime player turn" 注释：保留（仍准确描述当前默认行为），但加一段"本 change 起将开放 `submit_player_turn` strict function tool 在 Responses 通道下的使用"。
- `src/lib/ai/stream/responsesLike.ts:1-` 文件头注释：补"这是真原生流式转换器，不是包装"；并写明它与 `nonStreamResponsesToChatCompletionsStream` 的分工（前者用于支持流式的 Responses 端点，后者仅用于 Ark 在该组合下的降级）。
- `AGENTS.md §3.2` 在 §3.2.2 / §3.2.4 之间新增一小节"§3.2.5 Responses 通道流式现状"，明确：`openaiResponsesGateway` 协议层已支持流式 + `responsesLike.ts` 转换器已实现 + Ark 在该特定组合下的降级路径已存在；并指明 PLAYER_CHAT 走 Responses 通道是本 change 的目标。

### B. 契约 / 单元测试覆盖

- 新增 `src/lib/ai/stream/responsesLike.test.ts`：覆盖 `responsesToChatCompletionsTransform` 把 `response.output_text.delta` → `delta.content`、`response.completed` → `finish_reason:"stop"` + `[DONE]`、`response.error` → 空 chunk + `[DONE]`、tool_call item → tool_calls 帧（`function_call.arguments` 流式累计）。
- 新增 `src/lib/ai/stream/nonStreamResponsesToChatCompletionsStream.test.ts`（如果该函数没有现存测试）：覆盖 Ark 不可用组合下的非流式包装行为，断言输入 JSON body 解析为单段 narrative + 一帧 stop。
- 扩展 `src/lib/ai/gateway/openaiCompatible.playerTurnTool.test.ts` + 新增 `src/lib/ai/gateway/openaiResponses.playerTurnTool.test.ts`（如不存在）：分别断言两个通道下 `submit_player_turn` + `tool_choice` 都能正确进入请求体。
- `src/lib/ai/router/execute.gateway-contract.test.ts`：新增 fixture"PLAYER_CHAT 在 Responses 通道下走 strict function 流式 + 真原生 SSE"。

### C. 路由 / 网关逻辑（OpenSpec 强制 change 主项）

- `src/lib/ai/gateway/openaiResponses.ts`：当 `usePlayerTurnTerminalTool` 命中时（即 `body.stream && mode !== "off" && !body.tools`），把 20-tool / player-turn-terminal-tool 视情况追加到 Responses 通道 payload 里（用 Responses API 的 `tools` 数组 + `tool_choice: { type: "function", name }` 形状）。**不**把 `text.format.json_schema` 与 `tools` 一起开（保留 §3.2.2 互斥约束）。
- `src/lib/ai/stream/responsesLike.ts`：补全对 Responses API `function_call` output item 的解析（`item.type === "function_call"` → `tool_calls: [{ id, type:"function", function: { name, arguments } }]`），并对流式追加的 `arguments` delta 做跨事件累加，最后在 `response.completed` 时输出 finish_reason + `[DONE]`。
- `src/lib/ai/router/execute.ts` / `src/app/api/chat/route.ts`：**不**改 SSE 契约；只确保当 PLAYER_CHAT 任务路由到 Responses 通道时，consumer pipeline 仍能消费 `responsesToChatCompletionsTransform` 的输出（即现有 `parseOpenAiLikeStreamData` 不变）。新增/调整单点判断：PLAYER_CHAT + Responses 通道 + 启用 strict function 模式 → 走 `responsesToChatCompletionsTransform` 的 `function_call` 解析分支。
- `src/lib/ai/resilience/fetchWithRetry.playerTurnTool.test.ts` / `src/lib/ai/router/execute.playerStream.fallback.test.ts`：扩展断言 Responses 通道在 strict function 模式被网关拒绝时也能降级到 `json_object`（保留 `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE=prefer` 的"拒一次回退一次"行为）。
- 保留"Ark 不可用组合"的降级路径：`usePlayerTurnTerminalTool` + Responses 通道 + 上游 endpoint 在 `streaming+thinking:disabled+json_object` 下产出 narrative 而非 JSON → 路由检测到 `is_ark_incompatible_combo` 标记时切到 `nonStreamResponsesToChatCompletionsStream`（**不**破坏 `submit_player_turn` 终态工具语义；不可用时按"网关拒 tool_choice"的同类降级语义处理）。
- **不修改**：`/api/chat` SSE 响应类型（`text/event-stream; charset=utf-8`）、status 帧格式、权威终帧格式（`__VERSECRAFT_FINAL__:<json>`）、DM JSON 最低字段（`is_action_legal` / `sanity_damage` / `narrative` / `is_death`）、`resolveDmTurn` 提交对象、HTIL middleware（`enforceToolCallShape`）、`usePlayerTurnTerminalTool` 三元表达式本身。
- **不修改**：AGENTS.md §3.4 性能预算（first visible text p50 ≤ 2500ms、normal final p50 ≤ 12000ms、p95 ≤ 20000ms）。性能验证走 `pnpm benchmark:chat:mock` + 现有 `e2e/chat-sse-contract.spec.ts`；不达标不合并。

### Capabilities

### New Capabilities

- `player-turn-responses-streaming`: PLAYER_CHAT 在线主链路在 Responses 通道下用 `submit_player_turn` strict function tool + 真原生 SSE 流式（`response.output_text.delta` / `response.function_call.arguments.delta` / `response.completed`），转换器把 Responses SSE 渲染为既有 Chat Completions 流式 chunk 形状，保持下游 `parseOpenAiLikeStreamData` / `resolveDmTurn` / `__VERSECRAFT_FINAL__` 契约不变。

### Modified Capabilities

- `vendor-neutral-ai-gateway-configuration`: gateway 选择现在按 `transport` 字段分两路（`openai_compatible` / `openai_responses`），且 `openai_responses` 路径在 strict function 模式下也支持 `tools` + `tool_choice`，不再限于"只走 text.format.json_schema"。要求：transports 行为对 PLAYER_CHAT 任务保持"严格 function tool 互斥 json_schema"约束（§3.2.2）。

## Impact

- **代码 / API**：
  - 受影响模块（消费者 / 生产者都要对齐）：
    - 生产者：`src/lib/ai/gateway/openaiResponses.ts`、`src/lib/ai/tools/playerTurnTerminalTool.ts`（保持不变，但新被 Responses 通道消费）
    - 消费者：`src/lib/ai/stream/responsesLike.ts`、`src/lib/ai/resilience/fetchWithRetry.ts`（Responses 通道的 `tool_choice` 拒答降级）、`src/lib/ai/router/execute.ts`（gateway 选择）、`src/app/api/chat/route.ts`（`usePlayerTurnTerminalTool` 触发的工具追加路径，不改 SSE 契约）
  - **不**改：`useGameStore.ts`、SSE 控制帧 / 终帧格式、`resolveDmTurn.ts`、`commitTurn.ts`、`normalizePlayerDmJson.ts`、`validateNarrative.ts`、`HITL middleware (enforceToolCallShape)`、narrative 包 / chapter 包 / world engine / analytics 事件名 / DB schema / preset 目录 / `openaiCompatibleGateway` 本体。
- **依赖**：无新增 npm 依赖。
- **SSE 契约**：保持 `text/event-stream; charset=utf-8` 不变；status 帧 `__VERSECRAFT_STATUS__:{...}` 保持；权威终帧 `__VERSECRAFT_FINAL__:<json>` 保持；终帧覆盖此前累积正文的语义保持。
- **性能预算（AGENTS.md §3.4）**：不变。first visible text p50 ≤ 2500ms、p95 ≤ 5000ms；normal final p50 ≤ 12000ms、p95 ≤ 20000ms。`pnpm benchmark:chat:mock` 必须实际跑过且不回归；未达不合并。
- **首包 / TTFT 影响**：Responses 通道在长 structured prompt 下走 strict function tool 时，受 `submit_player_turn` strict 约束解码保护，TTFT 与 Chat Completions 通道在同一预算下。
- **降级策略**：
  - `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE=prefer` 默认：网关拒 `tool_choice` 时退到 `response_format: { type: "json_object" }`（保留现有 `playerTurnTerminalToolResponse.ts` 行为）。
  - Ark agent-plan minimax-m3 不可用组合：路由检测 + 切到 `nonStreamResponsesToChatCompletionsStream`。
  - `keys_missing` / 网关不可达：保持现有 SSE 降级语义（`X-VerseCraft-Ai-Status: keys_missing` + 可解析 `__VERSECRAFT_FINAL__`）。
- **灰度开关**：复用 `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE`（`off` / `prefer` / `required`）+ 现有 `getProviderFactory(transport)` 路由。`openai_responses` 是否走 strict function 路径由 transport 字段（DB `ai_service_connections.transport`）+ `usePlayerTurnTerminalTool` 共同决定；不引入新 flag。
- **不破坏现有契约**：`/api/chat` SSE 协议、`__VERSECRAFT_FINAL__` 终帧覆盖、`resolveDmTurn` 提交对象、`useGameStore` 主 store 持久化、`RunSnapshotV2`、`world_engine_*` 表 / 事件名 / `analytics_events` 全部保护。
- **不在本 change 范围**：
  - LangGraph 重构（已被 `introduce-langgraph-director-orchestration` supersede，路由仍走手工管线）。
  - DM Agent 工具链（`integrate-bounded-dm-agent-tools` change）。
  - thinking 政策（`lock-think-mode-off` change 已锁定，Responses 通道沿用）。
  - preset 目录 / Admin UI 暴露新 transport 选项（`AdminConsole.tsx` 的 transport 下拉仍只列 `openai_compatible` / `ark_multimodal` 两档；本 change 不会让 admin UI 暴露 `openai_responses`）。
  - 任何世界专属文案、NPC / 物品 / 章节 seed 改动。
