# AI 多模型链路故障排查

## 现象：玩家对话立即报错 / SSE 无内容

1. **密钥**：Coolify 或 `.env.local` 是否至少配置 `DEEPSEEK_API_KEY`、`ZHIPU_API_KEY`、`MINIMAX_API_KEY` 之一？玩家主链优先 `deepseek-v3.2`，无 DeepSeek 密钥时才会落到链上其他已配置模型（见 `resolveOrderedModelChain`）。
2. **模式**：是否误设 `AI_OPERATION_MODE=emergency`？紧急模式仅尝试 `deepseek-v3.2`（有密钥时），其它模型不会参与玩家链。
3. **熔断**：连续上游失败会打开 provider / model 电路（见 `docs/ai-fallback.md`）。重启进程或等待 `AI_CIRCUIT_COOLDOWN_MS` 后重试。
4. **日志**：搜索 `[ai/taskPolicy]`、`[ai]`、`ai.telemetry` 相关结构化日志，确认 `failureKind`（429、5xx、超时等）。

## 现象：JSON 解析失败 / DM 结构异常

1. **JSON mode**：`PLAYER_CHAT` 等对结构化输出要求高的任务在 DeepSeek/智谱路径会带 `response_format: json_object`；MiniMax 路径由 prompt 约束（`router/execute.ts` 中对 minimax 关闭 json_mode）。
2. **上行消息**：确认历史消息已剥离 `reasoning_content`（`stream/sanitize.ts`）；否则上游可能 400。

## 现象：增强叙事从未触发

1. **门控**：`enhancementRulesPure.ts` 中 `evaluateNarrativeEnhancementGate` 需要控制面 `enhance_scene` / `enhance_npc_emotion` 与规则快照同时满足；并受会话预算约束（`docs/ai-governance.md`）。
2. **任务类型**：MiniMax 仅绑定 `SCENE_ENHANCEMENT` / `NPC_EMOTION_POLISH`，且禁止表阻止其进入 `PLAYER_CHAT`。

## 现象：本地正常、Coolify 异常

1. 环境变量键名是否与 `.env.example` **完全一致**（含 `ZHIPU_API_KEY` / `BIGMODEL_API_KEY` 别名）？
2. `DATABASE_URL` / `AUTH_SECRET` 是否在启动阶段通过校验（`validateCriticalEnv.ts`）？启动失败时检查容器日志中的 `[VerseCraft config]`。

## 相关源码入口

- 玩家 SSE：`router/execute.ts` → `executePlayerChatStream`
- 非流式任务：`executeChatCompletion`
- 环境：`config/env.ts`、`config/envRaw.ts`
- 降级：`degrade/mode.ts`
