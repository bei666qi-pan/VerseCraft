## Context

`src/lib/ai/gateway/openaiResponses.ts` 当前是 OpenAI Responses API 通道的 `ProviderRequestFactory`，通过 `src/lib/ai/providers/index.ts:13-15 getProviderFactory(transport)` 路由：当 service 的 `ai_service_connections.transport === "openai_responses"` 时返回该 gateway，其它 transport 走 `openaiCompatibleGateway`。

**协议层支持流式**：openaiResponses.ts 顶部注释（`:9-14`）明确列出 Responses API 的流式事件 `response.created` / `response.output_text.delta` / `response.completed`；请求体里 `payload.stream = body.stream`（`:71`）透传流式开关；`stream_options: { include_usage: true }`（`:83-86`）也支持。

**流式转换器已存在**：`src/lib/ai/stream/responsesLike.ts` 实现了 `responsesToChatCompletionsTransform`（`openaiResponses.ts:5-7` 顶部注释引用），把 `response.output_text.delta` → `{choices:[{delta:{content:...}}]}`，`response.completed` → finish_reason:"stop" + `[DONE]`。

**当前 PLAYER_CHAT 在线主链路只走 Chat Completions 通道**：`usePlayerTurnTerminalTool` 三元表达式（`src/lib/ai/gateway/openaiCompatible.ts:56-58`）只在 `body.tools.length === 0` 时把 `submit_player_turn` 强制追加到 Chat Completions 请求里。Responses 通道即便 transport 是 `openai_responses`，因为 `usePlayerTurnTerminalTool` 不在 Responses 通道代码里运行，PLAYER_CHAT 实际不会触发 strict function tool。

**Ark agent-plan minimax-m3 的降级路径已存在**：`openaiResponses.ts:60-67` 注释 + `nonStreamResponsesToChatCompletionsStream` 函数（`stream/responsesLike.ts` 之外的另一段代码引用）已经把"streaming+thinking:disabled+json_object 不可用"组合切到非流式包装。

**当前问题**：
1. `openaiResponses.ts:60-67` 注释让阅读者误以为 Responses 通道没有真原生流式（实际是协议层支持，Ark 特定组合下走降级）。
2. `openaiResponses.ts:88-90` "Tools are not used in the realtime player turn" 注释把 strict function tool 关在 PLAYER_CHAT 门外。
3. `responsesLike.ts` 的 `responsesToChatCompletionsTransform` 已有 `response.output_text.delta` / `response.completed` 解析，但**没有** `function_call` 帧的解析——所以即便开了 strict function 模式，模型在 Responses 通道下返回的 `response.function_call.arguments.delta` 事件也无法被现有转换器消费。
4. 没有契约测试覆盖 `responsesToChatCompletionsTransform` 的真流式转换和 Ark 降级路径。

## Goals / Non-Goals

**Goals:**
- 让 `PLAYER_CHAT` 在 `openai_responses` transport 上走真原生 SSE 流式（不经过 `nonStreamResponsesToChatCompletionsStream` 包装），同时使用 `submit_player_turn` strict function tool。
- 保持 `/api/chat` SSE 协议不变（`text/event-stream; charset=utf-8` / status 帧 / `__VERSECRAFT_FINAL__` 终帧 / DM JSON 最低字段）。
- 保持 `usePlayerTurnTerminalTool` 既有语义（mode = `off|prefer|required`、调用方自带 tools 不追加），但把它的判定从"只在 Chat Completions 通道生效"扩展到"两个通道都生效"。
- 保持 strict function tool 和 `text.format.json_schema` 在同一请求里互斥（AGENTS.md §3.2.2）。
- 保持 `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE=prefer` 的"网关拒 tool_choice → 退 json_object"降级语义在 Responses 通道上也工作。
- 修复 `openaiResponses.ts` / `responsesLike.ts` 顶部注释与协议层实际行为不一致的部分。
- 新增覆盖 `responsesToChatCompletionsTransform` 真流式转换的契约测试。

**Non-Goals:**
- 不改 `/api/chat` 路由的 SSE 响应类型、status 帧格式、权威终帧格式、DM JSON 最低字段。
- 不改 `usePlayerTurnTerminalTool` 三元表达式的逻辑。
- 不改 `resolveDmTurn` / `commitTurn` / `normalizePlayerDmJson` / `validateNarrative` / HITL middleware (`enforceToolCallShape`)。
- 不改 `useGameStore.ts` 持久化、RunSnapshotV2、world engine / chapter 包 / analytics 事件名 / DB schema。
- 不动 LangGraph 编排（已被 `introduce-langgraph-director-orchestration` supersede）。
- 不动 DM Agent 工具链（属于 `integrate-bounded-dm-agent-tools` change 范围）。
- 不在 `AdminConsole.tsx` transport 下拉框里新增 `openai_responses` 选项。
- 不在 `aiModelPresets.ts` 厂商 preset 里启用 Responses 通道。
- 不修改 AGENTS.md §3.4 性能预算。
- 不修改 thinking 政策（属于 `lock-think-mode-off` 范围）。

## Decisions

### Decision 1: 抽 `usePlayerTurnTerminalTool` 到共享位置
- **选 A（抽公共 helper）**：把 `usePlayerTurnTerminalTool` 三元表达式从 `openaiCompatible.ts:56-58` 抽到 `src/lib/ai/tools/playerTurnTerminalTool.ts`（或 `src/lib/ai/providers/types.ts` 旁），两个 gateway 都调用。**选 B（复制粘贴）**：在 `openaiResponses.ts` 里写一份等价判定。**选 C（路由层判定后注入）**：在 `router/execute.ts` 里判定后注入到 `body.tools` / `body.toolChoice`，两个 gateway 只透传。
- **选 C**。理由：判定逻辑本质是"PLAYER_CHAT 是否启用 strict function tool"，跟 transport 无关；放在 router 层把决策与执行分离，gateway 保持纯组装。代价：需要让 `body.tools` 接受 router 注入（已经是这样，因为 `usePlayerTurnTerminalTool` 的 `else if (body.tools && body.tools.length > 0)` 走透传路径）。
- **被否决的备选**：A 抽公共 helper 改 1 个文件 + 2 个 gateway 调用点，但把"是否启用 strict function"和"如何组装 tools"两件事耦合在 helper 里，不利于后续接入更多 transport；B 复制粘贴会让两套 gateway 行为漂移；C 是最小侵入。

### Decision 2: `responsesToChatCompletionsTransform` 增加 `function_call` 输出项解析
- **选 A（解析 `function_call` 输出项）**：补全 `responsesLike.ts` 对 Responses API `function_call` output item 的解析（`item.type === "function_call"` → 产出 Chat-Completions `tool_calls` 帧，跨事件累加 `arguments`）。**选 B（拒用工具，强制 json_schema）**：保持 `openaiResponses.ts:88-90` "Tools are not used" 注释不变。**选 C（双 gateway 各自维护）**：Chat Completions 走 `submit_player_turn` + 现有解析；Responses 走 `text.format.json_schema` 强制，不开工具。
- **选 A**。理由：user 的核心需求是"PLAYER_CHAT 在 Responses 通道下也能用 strict function tool + 真流式"；AGENTS.md §3.2.1 强调 strict function tool 是 minimax-m3 在长 prompt 下唯一可靠的物理约束手段，§3.2.2 明确分类抽取用 json_schema、agent 决策用 function tool；PLAYER_CHAT 是后者，不能因为 transport 切到 Responses 就退到 json_schema。代价：实现需要为 `function_call` 帧写新解析 + 跨事件 `arguments` 累加 + `response.completed` 时 finish_reason:"tool_calls" + `[DONE]`。
- **被否决的备选**：B 直接放弃 strict function tool 的物理约束；C 让两个 transport 行为漂移（PLAYER_CHAT 在不同 transport 下字段不同），违反 §2.1 "Writer 唯一玩家可见叙事责任主体"。

### Decision 3: Ark 不可用组合下的"非流式包装"语义
- **选 A（保留包装为 json_object 模式专属）**：`nonStreamResponsesToChatCompletionsStream` 只在 `text.format.json_schema` 路径（mode=off）下启用；strict function 模式走真流式，不走包装。**选 B（包装也覆盖 strict function 模式）**：即便开了 strict function tool，Ark 仍走非流式包装。
- **选 A**。理由：strict function 模式有 §3.2.3 HITL middleware + 物理约束解码两道防线，minimax-m3 即便在该组合下产出 narrative 也会被中间件修正（`phaseParseAndNormalizeCandidate` 之前的 `enforceToolCallShape`）。非流式包装会丢 SSE 渐进叙事，破坏 first visible text p50 ≤ 2500ms 预算。
- **被否决的备选**：B 把 strict function 工具调用也强行用非流式包装——会丢流式体验，且与 §3.2.3 中间件"二次把关"职责冲突。

### Decision 4: 拒绝重试的 `tool_choice` 错误识别
- **选 A（复用现有 `playerTurnTerminalToolResponse.ts` 模式）**：`fetchWithRetry` 收到上游 400 错误时，正则匹配 `tool_choice|tool calls?|function calls?|function_call|unknown (?:field|parameter)|unsupported|not support|does not support`，重写请求体为 `response_format: { type: "json_object" }` 后重试一次。**选 B（仅日志不重试）**：记录错误并直接 fail-open。
- **选 A**。理由：与 Chat Completions 通道的现有降级语义完全对齐，`AI_PLAYER_CHAT_FUNCTION_CALLING_MODE=prefer` 默认就是这种"试一次 strict tool，拒就退 json_object"的容错。代价：需要在 `fetchWithRetry` 里给 Responses 通道也加同样的识别（Responses API 错误的 `message` 字段格式与 Chat Completions 一致，正则可直接复用）。
- **被否决的备选**：B 失去 prefer 模式的容错价值。

### Decision 5: Admin UI / preset 目录不动
- **选 A（保持 Admin UI transport 下拉只有 `openai_compatible` / `ark_multimodal` 两档）**：DB seed 已经写了 `openai_responses` service（`db/ensureSchema.ts:1482`），但 Admin UI 还没暴露。**选 B（把 `openai_responses` 暴露到 Admin UI）**：让用户从管理界面也能新增 Responses 服务。
- **选 A**。理由：本 change 范围是"PLAYER_CHAT 能用 Responses 通道 + 流式 strict function tool"，DB seed 已经提供；暴露 UI 是另一个 scope（涉及 `AdminConsole.tsx` + 路由 + service 模型扩展测试），按 §5.2 强制 change 规则应另起 change。
- **被否决的备选**：B 越界，且 `aiModelPresets.ts:55` 注释明确"全部为 openai_compatible"，改 preset 也是独立 scope。

## Risks / Trade-offs

- **[Risk]** Responses API 的 `function_call` 事件格式（output item + arguments delta）与 Chat Completions `tool_calls` 流式格式不同（前者单 item 内 arguments 跨事件累加，后者是 `tool_calls: [{ index, function: { arguments: delta } }]`），跨事件累加逻辑写错会导致 `submit_player_turn` 的最终 arguments 不是合法 JSON。
  → **Mitigation**：单测覆盖 `function_call.arguments.delta` 累加、跨多次 delta 合并为完整 JSON、`response.completed` 时 `finish_reason:"tool_calls"` + `[DONE]`；并复用 `enforceToolCallShape` HITL middleware（§3.2.3）作为最终防线。

- **[Risk]** `responsesToChatCompletionsTransform` 与 `nonStreamResponsesToChatCompletionsStream` 共存，路由层需要根据"是否 strict function 模式 + 是否 Ark 不可用组合"判断走哪条，状态机容易出错。
  → **Mitigation**：路由层判定收敛到 Decision 1 描述的 router 层 helper；不允许 gateway 内自分支；判定逻辑单测覆盖所有 (mode, transport, ark_flag) 组合。

- **[Risk]** strict function tool 模式下 `openaiResponsesGateway` 拒绝同时开 `text.format.json_schema`（§3.2.2 互斥），如果路由层 / 业务层在 strict function 模式下还把 `responseFormatJsonSchema` 传给 Responses gateway，会被 §3.2.2 打破——目前 Responses 通道是 100% 接受 `responseFormatJsonSchema`（`openaiResponses.ts:104-152`），如果不主动拦截会冲突。
  → **Mitigation**：在 Responses gateway 的 strict function 模式分支里显式 `delete payload.text`（参考 `playerTurnTerminalToolResponse.ts:40-42` 删除 `tool_choice` 的做法），保证同请求里 strict tool 与 json_schema 互斥。

- **[Risk]** Responses 通道真流式 first visible text 受 `reasoning` 字段（默认 `effort: "low"`）开销影响，可能比 Chat Completions 通道略慢。
  → **Mitigation**：`openaiResponses.ts:96-103` 已支持通过 `extraBody.thinking = { type: "disabled" }` 跳过 `reasoning` 注入；PLAYER_CHAT 走 strict function tool 时沿用现有 extraBody（如有）。`pnpm benchmark:chat:mock` 必须实际跑过且不回归到 §3.4 预算。

- **[Risk]** 性能预算回归：Responses 通道 + strict function + 真流式 + 转换器可能突破 first visible text p50 ≤ 2500ms。
  → **Mitigation**：在 `pnpm benchmark:chat:mock` 里加 Responses 通道的 case；如不达标，**不合并**。`pnpm test:e2e:contract` 必须真实执行并通过。

- **[Risk]** Ark agent-plan minimax-m3 实际生产行为可能在 strict function + 真流式下产出不可用 JSON，本地单测无法复现。
  → **Mitigation**：保留 Decision 3 选 A 的"非流式包装仅在 json_object 模式"边界；strict function 模式在 Ark 不可用时由 `enforceToolCallShape` 中间件二次修正（§3.2.3）+ fail-open（路由层不因此 reject，按畸形 DM JSON 走现有 `phaseRepairMalformedCandidate` 路径）。

- **[Risk]** `responsesToChatCompletionsTransform` 是异步迭代器，与现有 `parseOpenAiLikeStreamData` 同步累积行为差异。
  → **Mitigation**：复用现有 `responsesLike.ts:200-` "buffer complete SSE events" 模式 + 把 `textStream` / `toolCallStream` 状态收敛到单个对象，逐事件 yield Chat-Completions chunk；保持 `parseOpenAiLikeStreamData` 的下游接口（最终走 `[DONE]` 终止 + 累积 text + 累积 tool_calls）不变。

## Migration Plan

1. **Phase 1：文档 / 注释同步**（A 层，可独立合并）
   - 修 `openaiResponses.ts:1-14` / `:60-67` / `:88-90` 注释
   - 修 `responsesLike.ts:1-` 注释
   - 补 `AGENTS.md §3.2.5` 一段
   - 不改代码逻辑，可合并 + 单独 review
2. **Phase 2：契约测试覆盖**（B 层，可独立合并）
   - `responsesLike.test.ts`（新建）：覆盖 `responsesToChatCompletionsTransform` 的 `output_text.delta` / `function_call.arguments.delta` / `response.completed` / `response.error` 四类事件
   - `nonStreamResponsesToChatCompletionsStream.test.ts`（如不存在则新建）：覆盖 json_object 模式下 Ark 不可用组合的非流式包装
   - `openaiResponses.playerTurnTool.test.ts`（新建）：覆盖 Responses 通道 strict function tool 注入
   - `execute.gateway-contract.test.ts`：扩展 fixture
3. **Phase 3：路由 / 网关逻辑**（C 层，按 OpenSpec 实施）
   - `router/execute.ts`：抽 `usePlayerTurnTerminalTool` 到 router 层（Decision 1）
   - `openaiResponses.ts`：strict function 模式分支（Decision 2）+ `text` 字段在 strict function 模式下被删除（Risk mitigation）
   - `responsesLike.ts`：补全 `function_call` 帧解析（Decision 2）
   - `fetchWithRetry.ts`：Responses 通道的 `tool_choice` 拒答识别 + 重试（Decision 4）
4. **回滚**：
   - Phase 1 / Phase 2 是纯文档 / 纯测试，回滚 = revert commit
   - Phase 3：把 `usePlayerTurnTerminalTool` 决策收回 `openaiCompatible.ts` + `openaiResponses.ts` 各自本地判定；`openaiResponses.ts` 移除 strict function 模式分支；`responsesLike.ts` 移除 `function_call` 解析；`fetchWithRetry.ts` 移除 Responses 通道的降级识别。整段 revert 即可。
5. **灰度**：
   - 不引入新 flag；`AI_PLAYER_CHAT_FUNCTION_CALLING_MODE` 默认 `prefer` 不变
   - 走 Responses 通道的 service 仅 Ark agent-plan minimax-m3（`db/ensureSchema.ts:1482`）一个；其它 service 仍 `openai_compatible` transport
   - 灰度靠 `ai_service_connections.transport` 字段切换：管理员把 service transport 改成 `openai_responses` 即生效；改回 `openai_compatible` 即回退
6. **未做**：Admin UI 暴露 `openai_responses` 选项（独立 change 范围）；preset 目录新增 Responses 通道（独立 change 范围）

## Open Questions

1. **是否需要为 Responses 通道的 strict function 模式单独加 e2e fixture？** 当前 `e2e/chat-sse-contract.spec.ts` 是否已覆盖 Responses 通道？如未覆盖，Phase 3 必须扩展 e2e，不能只靠单测。
2. **`reasoning: { effort: "low" }` 默认值（`openaiResponses.ts:101-103`）在 strict function 模式下是否仍注入？** 推断应不注入（PLAYER_CHAT 不需要思考），但需要确认 §3.2 的 lock-think-mode-off 政策是否已经覆盖 Responses 通道。
3. **AGENTS.md §3.2.5 新增小节是否要同步进 §3.1 SSE 契约段？** 因为 strict function 模式不改变 SSE 响应类型，本 design 默认不修改 §3.1；待用户 review proposal/design 时确认。
