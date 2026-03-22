# AI 多模型链路故障排查

## 现象：玩家对话立即报错 / SSE 无内容

1. **网关**：是否配置 `AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`，且 `AI_MODEL_MAIN`（及 fallback 所需 `AI_MODEL_CONTROL` 等）非空？见 `resolveOrderedRoleChain` 与 `anyAiProviderConfigured`。未配置时 `/api/chat` 可能返回 **200 + `X-VerseCraft-Ai-Status: keys_missing`**（降级 SSE），与真流式不同 — 详见 [`docs/ai-gateway.md`](ai-gateway.md) 测试一节。
2. **模式**：是否误设 `AI_OPERATION_MODE=emergency`？紧急模式玩家链仅 **main** 角色。
3. **熔断**：连续上游失败会打开 provider / logicalRole 电路（见 `docs/ai-fallback.md`）。重启进程或等待 `AI_CIRCUIT_COOLDOWN_MS` 后重试。
4. **日志**：搜索 `[ai/taskPolicy]`、`[ai]`、`ai.telemetry` 相关结构化日志，确认 `failureKind`（429、5xx、超时等）。

## 现象：JSON 解析失败 / DM 结构异常

1. **JSON mode**：需要 JSON 的任务在网关路径上带 `response_format: json_object`；增强类任务（`responseFormatJsonObject: false`）由 prompt 约束。若 one-api 背后模型不支持该模式，会在网关层报错或返回非 JSON — 请在 one-api **换通道/模型** 或关闭不兼容任务链。
2. **上行消息**：确认历史消息已剥离 `reasoning_content`（`stream/sanitize.ts`）；否则上游可能 400。

## 现象：长时间「正在生成」或整段超时

1. **两层超时**：`/api/chat` 对玩家 SSE 有 **路由级约 60s** 中止；`execute` 内重试/单次请求超时由 **`AI_REQUEST_TIMEOUT_MS` / `AI_TIMEOUT_MS`** 控制；控制面预检另有 **约 11s** 上限。三者关系见 [`docs/ai-gateway.md`「超时说明」](ai-gateway.md)。
2. **探活**：配置齐全后可用 `pnpm probe:ai-gateway` 验证 one-api 是否可达（极小请求，可能少量计费）。

## 现象：增强叙事从未触发

1. **门控**：`enhancementRulesPure.ts` 中 `evaluateNarrativeEnhancementGate` 需要控制面 `enhance_scene` / `enhance_npc_emotion` 与规则快照同时满足；并受会话预算约束（`docs/ai-governance.md`）。
2. **任务类型**：**enhance** 角色仅绑定 `SCENE_ENHANCEMENT` / `NPC_EMOTION_POLISH`，禁止表阻止 **enhance** / **reasoner** 进入 `PLAYER_CHAT`。

## 现象：本地正常、Coolify 异常

1. 环境变量键名是否与 `.env.example` **完全一致**（`AI_GATEWAY_*`、`AI_MODEL_*`）？
2. `DATABASE_URL` / `AUTH_SECRET` 是否在启动阶段通过校验（`validateCriticalEnv.ts`）？启动失败时检查容器日志中的 `[VerseCraft config]`。

## 相关源码入口

- 玩家 SSE：`router/execute.ts` → `executePlayerChatStream`
- 非流式任务：`executeChatCompletion`
- 环境：`config/env.ts`、`config/envRaw.ts`
- 降级：`degrade/mode.ts`
