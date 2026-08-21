# player-turn-responses-streaming Specification

## Purpose
TBD - created by archiving change open-responses-streaming-for-player-turn. Update Purpose after archive.

## Requirements

### Requirement: PLAYER_CHAT SHALL stream natively over the Responses channel
The `/api/chat` player-chat coordinator SHALL route a `PLAYER_CHAT` request that lands on a service whose `ai_service_connections.transport` is `openai_responses` through `openaiResponsesGateway` and consume the upstream OpenAI Responses API SSE stream natively. The native streaming translator at `src/lib/ai/stream/responsesLike.ts` SHALL render upstream `response.output_text.delta`, `response.function_call_arguments.delta`, and `response.completed` events into the same Chat-Completions-shaped SSE chunks the rest of the consumer pipeline expects, so `parseOpenAiLikeStreamData`, the `__VERSECRAFT_STATUS__` and `__VERSECRAFT_FINAL__` envelope, and `resolveDmTurn` are unchanged.

#### Scenario: Responses channel emits native text deltas
- **WHEN** the upstream Responses endpoint emits a `response.output_text.delta` event
- **THEN** the translator emits a `data: {choices:[{delta:{content:...}, finish_reason:null}]}\n\n` chunk followed by any pending `data: [DONE]\n\n` after `response.completed`

#### Scenario: Responses channel emits native function call deltas
- **WHEN** the upstream Responses endpoint emits a `response.function_call` item with `arguments` deltas
- **THEN** the translator buffers the `arguments` across events and emits Chat-Completions `tool_calls` chunks whose `function.arguments` strings concatenate to the final JSON; on `response.completed` the translator emits a final chunk with `finish_reason:"tool_calls"` and then `[DONE]`

#### Scenario: Responses channel error terminates the stream safely
- **WHEN** the upstream Responses endpoint emits `response.error` or `response.failed`
- **THEN** the translator emits an empty content chunk with `finish_reason:"stop"` followed by `[DONE]`, leaving `__VERSECRAFT_FINAL__` envelope production to the existing pipeline

### Requirement: PLAYER_CHAT SHALL use the `submit_player_turn` strict function tool on the Responses channel
When `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE !== "off"` and the active service transport is `openai_responses`, the `openaiResponsesGateway` SHALL append the `submit_player_turn` `ToolDefinition` to the request payload and pin `tool_choice: { type: "function", name: "submit_player_turn" }`. The gateway SHALL NOT also enable `text.format.json_schema` for the same request, in order to preserve the §3.2.2 strict-function-vs-json-schema mutual exclusion.

#### Scenario: Strict function mode on Responses channel
- **WHEN** a `PLAYER_CHAT` request reaches `openaiResponsesGateway` with `body.stream === true`, `body.tools` empty, and `resolvePlayerChatFunctionCallingMode()` returns `prefer` or `required`
- **THEN** the request body contains `tools: [{ type: "function", function: { name: "submit_player_turn", description: "...", parameters: PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS } }]`, `tool_choice: { type: "function", name: "submit_player_turn" }`, and SHALL NOT also contain `text.format: { type: "json_schema", ... }`

#### Scenario: Function-calling mode `off` skips the terminal tool
- **WHEN** `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE === "off"`
- **THEN** `openaiResponsesGateway` does not append `submit_player_turn` and the existing `text.format.json_schema` path remains in effect

#### Scenario: Caller-supplied tools win over the terminal tool
- **WHEN** a `PLAYER_CHAT` request reaches `openaiResponsesGateway` with non-empty `body.tools`
- **THEN** the gateway passes through the caller-supplied tools and does not append `submit_player_turn`; this mirrors the `openaiCompatibleGateway` `else if` branch

### Requirement: Responses channel rejection SHALL fall back to a JSON-mode retry
When `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE === "prefer"` and the upstream Responses endpoint returns HTTP 400 mentioning `tool_choice` / `function_call` / `tools`, `fetchWithRetry` SHALL retry exactly once with `tool_choice` and `tools` removed. On the Responses wire the retry body MUST set `text: { format: { type: "json_object" } }` (see AGENTS.md §3.2.6); on the Chat-Completions wire the retry body MUST set `response_format: { type: "json_object" }`. The wire shape is chosen by `buildPlayerTurnJsonFallbackInit` based on the request's `tool_choice` shape. When `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE === "required"` the gateway SHALL surface the incompatibility instead of silently downgrading.

#### Scenario: Prefer-mode rejection rewrites the Responses body with text.format.json_object
- **WHEN** a `PLAYER_CHAT` request with strict function tool reaches the Responses endpoint and the endpoint returns 400 with a `tool_choice` / `function_call` / `tools` error
- **THEN** `fetchWithRetry` rewrites the request body to drop `tools` and `tool_choice` and to set `text: { format: { type: "json_object" } }`; the retry response is processed as if it were a Responses API response

#### Scenario: Prefer-mode rejection rewrites the Chat-Completions body with response_format: json_object
- **WHEN** the same 4xx rejection occurs on a Chat-Completions request (tool_choice nested under `function`)
- **THEN** the retry body sets `response_format: { type: "json_object" }` instead and drops `tools` / `tool_choice` / `parallel_tool_calls`

#### Scenario: Required-mode rejection surfaces incompatibility
- **WHEN** `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE === "required"` and the upstream Responses endpoint rejects `tool_choice` / `tools`
- **THEN** the request fails with the upstream error code propagated to the route, the existing `__VERSECRAFT_FINAL__` keys_missing / incompatible-provider envelope is produced, and there is no silent retry

### Requirement: Ark-incompatible streaming+thinking:disabled+json_object combo SHALL fall back to non-stream wrap
When the active service is `Volcengine Ark agent-plan minimax-m3` (or any other endpoint previously observed to emit non-DM-JSON narrative deltas under `streaming + thinking:disabled + json_object`) and the caller is using `text.format.json_schema` (i.e. not in strict function mode), the route SHALL switch to `nonStreamResponsesToChatCompletionsStream` and wrap the upstream non-stream JSON body as a virtual Chat-Completions stream. The terminal tool path is unaffected: when strict function mode is in effect the route continues to use native streaming per the previous requirement.

#### Scenario: Non-strict function request hits Ark incompatible combo
- **WHEN** `AI_PLAYER_CHAT_FUNCTION_CALLING_MODE === "off"` and the active service is Ark agent-plan minimax-m3 with `text.format.json_schema` enabled
- **THEN** the route issues a non-stream Responses request and `nonStreamResponsesToChatCompletionsStream` produces a synthetic Chat-Completions stream whose terminal chunk is the upstream JSON body

#### Scenario: Strict function mode skips the non-stream wrap
- **WHEN** strict function mode is in effect
- **THEN** the route uses native streaming even on Ark endpoints; the non-stream wrap is reserved for the `text.format.json_schema` code path
