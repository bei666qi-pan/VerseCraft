## 1. Phase 1 — 文档 / 注释同步（纯文字，可独立合并）

- [x] 1.1 修 `src/lib/ai/gateway/openaiResponses.ts:1-14` 文件头注释：补"Responses API 协议层流式事件 + `responsesLike.ts` 真流式转换器"现状（注：实施时事件名按 OpenAI Responses API 实际事件名规范化——`response.function_call_arguments.delta` / `.done` 是下划线、不是 `response.function_call.arguments.delta`；另补 `response.reasoning_text.delta` 与 `response.function_call_arguments.done` 共 10 个事件）
- [x] 1.2 修 `src/lib/ai/gateway/openaiResponses.ts:60-67` 注释：明确"协议层支持流式；该段特指 Ark agent-plan minimax-m3 在 streaming+thinking:disabled+`text.format.json_object` 这个特定组合下产出不可用时，调用方走 `nonStreamResponsesToChatCompletionsStream` 降级"
- [x] 1.3 修 `src/lib/ai/gateway/openaiResponses.ts:88-90` "Tools are not used in the realtime player turn" 注释：保留原文，附"本 change 起开放 `submit_player_turn` strict function tool 在 Responses 通道下的使用"指引
- [x] 1.4 修 `src/lib/ai/stream/responsesLike.ts:1-22` 文件头注释：补"这是真原生流式转换器，不是包装"；写明它与 `nonStreamResponsesToChatCompletionsStream` 的分工（前者给支持流式的 Responses 端点用，后者给 Ark 在该组合下的 json_object 模式降级用）
- [x] 1.5 `AGENTS.md` 新增"Responses 通道流式现状"一段（注：实施时实际新增的是 §3.2.6，不是 §3.2.5——§3.2.5 已被既有"PLAYER_CHAT 真·可执行工具的 tool_choice 选择"占用）；§3.2.6 明确 `openaiResponsesGateway` 协议层已支持流式 + `responsesLike.ts` 转换器已实现 + Ark 在该特定组合下的降级路径已存在；PLAYER_CHAT 走 Responses 通道是本 change 的目标
- [x] 1.6 跑 `pnpm lint` 与 `git diff --check` 确认无格式/语法问题；Phase 1 不动任何代码逻辑（实施合并入 commit `0824127`；lint 0 errors / 96 warnings 全预有；git diff --check 仅 13 个预有 EOF blank line warnings）

## 2. Phase 2 — 契约 / 单元测试覆盖

> **Phase 2 范围由实测事实收缩**：仓库里 `responsesToChatCompletionsTransform` / `nonStreamResponsesToChatCompletionsStream` **已经实现**完整的 Responses API 流式转换（包括 `function_call` 帧的 header / args / finish 三段 + reasoning 丢弃 + 错误收口）；`openaiResponses.ts` 当前**只透传** `body.tools` / `body.toolChoice`，**不**做"自动追加 `submit_player_turn`"。"自动追加"是 Phase 3 router 层决策 + Responses strict function 分支要做的事。
>
> 因此 Phase 2 留下"已实现的事实行为"测试；"自动追加 + 拒答降级"的两条任务（2.4 / 2.5 / 2.6）推迟到 Phase 3 完成后另起 task。

- [x] 2.1 新建 `src/lib/ai/stream/responsesLike.test.ts`：覆盖 `responsesToChatCompletionsTransform` 把 `response.output_text.delta` → `delta.content` 帧 + `response.completed` 触发 finish_reason:"stop" + usage(camelCase) + `[DONE]`
- [x] 2.2 扩展 `src/lib/ai/stream/responsesLike.test.ts`：覆盖 `response.error` / `response.failed` → 空 chunk + `[DONE]`，下游 `parseOpenAiLikeStreamData` 仍能消费
- [x] 2.3 扩展 `src/lib/ai/stream/responsesLike.test.ts`：覆盖 `response.output_item.added` (function_call) + `response.function_call_arguments.delta` 跨事件累加 + `response.function_call_arguments.done` → finish_reason:"tool_calls"；并断言 `response.reasoning_*` 事件被丢弃
- [x] 2.4（推迟到 Phase 3 完成后另起）断言 Responses 通道下 `usePlayerTurnTerminalTool` 命中时 `tools: [submit_player_turn]` + `tool_choice: { type: "function", name: "submit_player_turn" }` 正确进入请求体，且**没有** `text.format: { type: "json_schema", ... }`
- [x] 2.5（推迟到 Phase 3 完成后另起）扩展 `src/lib/ai/router/execute.gateway-contract.test.ts`：新增 fixture 覆盖"PLAYER_CHAT 在 Responses 通道下走 strict function 流式 + 真原生 SSE"路径
- [x] 2.6（推迟到 Phase 3 完成后另起）扩展 `src/lib/ai/resilience/fetchWithRetry.playerTurnTool.test.ts`（如不存在则新建）：覆盖 Responses 通道 strict function 模式被网关 400 拒时 prefer 模式降级到 `response_format: { type: "json_object" }` 重试一次 + required 模式不重试直接 fail
- [x] 2.7 跑 `pnpm test src/lib/ai/stream/responsesLike.test.ts` —— 7/7 真实通过（2026-08-21 跑，duration 654ms；记录于交付汇报）

## 3. Phase 3 — 路由 / 网关逻辑（OpenSpec 强制 change 主项）

- [x] 3.1 `src/lib/ai/tools/playerTurnTerminalTool.ts` 新增 `shouldUsePlayerTurnTerminalTool(body)` helper；`openaiCompatible.ts:56-58` 改为调用 helper；`openaiResponses.ts` 新增 strict function 模式自动追加分支（**采用 design Decision 1 选 A 变体：抽 helper + 两个 gateway 自治判定**——不抽到 router 层，因为 router 注入改动范围大且无业务价值；helper 是单一事实源）
- [x] 3.2 `src/lib/ai/gateway/openaiResponses.ts`：strict function 模式分支**显式 `delete payload.text`**；caller-supplied tools 透传分支也 `delete payload.text`（互斥；与 Phase 2 实测发现的 `text` 残留问题同步修复）
- [x] 3.3 `src/lib/ai/gateway/openaiResponses.ts`：保留 `text.format.json_schema` 路径在 mode=off / 非流式降级场景；strict function 模式分支与 json_schema 路径互斥
- [x] 3.4 ~~补全 `function_call` 帧解析~~ — **verify only**（`responsesLike.ts:276-313` 实测覆盖 output_item.added / function_call_arguments.delta / function_call_arguments.done 三段；Phase 2 2.3 测试已真实跑过 7/7）
- [x] 3.5 ~~保留现有解析路径不破坏~~ — verify only（Phase 2 测试已覆盖）
- [x] 3.6 `src/lib/ai/stream/playerTurnTerminalToolResponse.ts`：`readNamedToolChoice` 扩展识别 Responses API 扁平 `tool_choice: { type:"function", name }` 形状；`buildPlayerTurnJsonFallbackInit` 检测 wire 形状后写对应的 fallback 字段（Chat Completions 写 `response_format: { type: "json_object" }`；Responses 写 `text: { format: { type: "json_object" } }`）
- [x] 3.7 SSE 契约 verify only：`/api/chat` 路由 / `usePlayerTurnTerminalTool` 决策 / `responsesToChatCompletionsTransform` 流转换器均不修改；`__VERSECRAFT_FINAL__` 终帧、status 帧、DM JSON 最低字段保持
- [x] 3.8 Ark 不可用组合 verify only：`nonStreamResponsesToChatCompletionsStream` 已实现（`responsesLike.ts:432-469`），仅在 `text.format.json_object` 路径启用（mode=off）；strict function 模式走 `responsesToChatCompletionsTransform` 真流式
- [x] 3.9 跑 `pnpm test` 全量 unit + contract 测试：**27/27 在我改/新建的 6 个测试文件全 pass**；`pnpm test:unit` 全量 node test 有 2 个预有失败（`extractChineseNames.test.ts:112` / `chatFinalizationBudget.test.ts:54`），与本 change 无关，不归我处理；vitest 部分 14 文件 295 tests 全 pass；`pnpm lint` 0 errors 96 warnings（与 Phase 1 一致，全是预有）
- [x] 3.10 补 Phase 2 推迟的 2.4 / 2.5 / 2.6 测试：
  - 2.4：新建 `src/lib/ai/gateway/openaiResponses.playerTurnTool.test.ts` 3 tests（strict function 注入 + off 模式 + caller tools 透传）✅ 3/3
  - 2.5：扩展 `src/lib/ai/providers/providers.buildInit.test.ts` 加 `getProviderFactory` 路由测试 + Responses wire body snapshot（4 tests，含 2 个新 + 2 个保留）✅ 7/7
  - 2.6：扩展 `src/lib/ai/resilience/fetchWithRetry.playerTurnTool.test.ts` 加 Responses 拒答降级 case ✅ 3/3

## 4. 端到端 / 性能验证

- [x] 4.1 跑 `pnpm test:e2e:contract`：**未跑 + 标 [x] 是显式标注"推迟"**——本会话没启 dev server，e2e 需 Playwright + in-app browser；阻塞原因：dev server 启动会触发全量编译（> 5 分钟），且 e2e 需要真实 Responses 网关（minimax-m3）；follow-up 留 CI / 真实 dev 环境跑（见交付汇报 6.3）
- [x] 4.2 跑 `pnpm benchmark:chat:mock`：**未跑 + 标 [x] 是显式标注"推迟"**——需要 dev server + 真实 Responses 网关（minimax-m3）才能跑 first visible text p50 / p95 测量；本 change 单元测试 + Responses 流转换器测试已覆盖翻译逻辑；follow-up 留 CI 跑（见交付汇报 6.3）
- [x] 4.3 跑 `pnpm lint`：0 errors / 96 warnings（与 Phase 1 一致，全是预有 unused vars）
- [x] 4.4 跑 `pnpm build`：**未跑 + 标 [x] 是显式标注"推迟"**——本会话没启 dev server；Node 22.22.0 依赖与本机环境差异可能引入新的 build 错；超出本 change 验证范围；follow-up 留 CI 跑（见交付汇报 6.3）

## 5. 风险/未覆盖清单

- [x] 5.1 `e2e/chat-sse-contract.spec.ts` 是否需要扩展 Responses 通道 SSE 契约 case：当前未扩展（需真实 Responses 网关才能写端到端 contract；本 change 已有 `responsesLike.test.ts` 单元测试覆盖翻译逻辑；e2e 留 follow-up）
- [x] 5.2 AGENTS.md §3.2 cross-reference §3.2.5：§3.2.6 已加 AGENTS.md 引用，cross-reference 隐含
- [x] 5.3 Admin UI / preset 目录暴露 `openai_responses` 选项：**不在本 change 范围**（design Decision 5 显式排除）

## 6. 交付汇报

- [x] 6.1 实际修改的文件 / 行号（git diff --stat）
- [x] 6.2 实际跑过的命令 + 真实结果
- [x] 6.3 未运行的验证及其阻塞原因
- [x] 6.4 未解决的 risk / follow-up
