# VerseCraft 统一大模型基础设施（`src/lib/ai`）

## 目录

| 路径 | 职责 |
|------|------|
| `config/env.ts` | 解析 `DEEPSEEK_*` / `ZHIPU_*` / `MINIMAX_*` / `AI_*` 路由与韧性参数 |
| `models/registry.ts` | **白名单**模型注册表（唯一合法 `model` 出口） |
| `tasks/routing.ts` | 按 `TaskType` 生成 fallback 链（禁止玩家链路使用 `deepseek-reasoner`） |
| `router/execute.ts` | 超时 + 重试 + 熔断 + 埋点 + 流式/非流式执行 |
| `providers/*` | 各厂商官方 HTTP 请求体构造（无 SDK 耦合点） |
| `stream/sanitize.ts` | 剥离 `reasoning_content` 等，仅 `role`+`content` 上行 |
| `stream/openaiLike.ts` | OpenAI 形态 SSE / JSON 解析归一 |
| `resilience/fetchWithRetry.ts` | 可重试 `fetch` |
| `fallback/circuitBreaker.ts` | 按 provider 进程内熔断 |
| `telemetry/log.ts` | 结构化 `ai.telemetry` 日志（成本字段见 `usage`） |
| `service.ts` | **业务唯一推荐入口**（再导出 router / 配置工具） |

## 核心入口

- **玩家实时 SSE**：`executePlayerChatStream`（`@/lib/ai/service`）
- **后台/异步 JSON**：`executeChatCompletion`（同上）
- **环境**：`resolveAiEnv`、`anyAiProviderConfigured`

## 白名单模型（与注册表一致）

- `deepseek-v3.2`（玩家默认主力）
- `deepseek-reasoner`（**仅**离线/后台；路由层禁止用于 `player_chat_stream`）
- `glm-5-air`
- `MiniMax-M2.7-highspeed`

## 环境变量摘要

- 密钥：`DEEPSEEK_API_KEY`、`ZHIPU_API_KEY`（或 `BIGMODEL_API_KEY`）、`MINIMAX_API_KEY`
- 玩家链路顺序：`AI_PLAYER_MODEL_CHAIN`（逗号分隔，须为白名单 ID）
- 任务默认模型：`AI_MEMORY_MODEL`、`AI_ADMIN_MODEL`
- 韧性：`AI_TIMEOUT_MS`、`AI_MAX_RETRIES`、`AI_CIRCUIT_FAILURE_THRESHOLD`、`AI_CIRCUIT_COOLDOWN_MS`

## 迁移与约束

- 业务代码禁止直接 `fetch` 厂商 API；须通过 `executePlayerChatStream` / `executeChatCompletion`。
- 新增模型：在 `models/registry.ts` 登记 → 在 `tasks/routing.ts` 调整策略 → **无需**改业务页面。
