# VerseCraft 统一大模型基础设施（`src/lib/ai`）

## 目录

| 路径 | 职责 |
|------|------|
| `config/env.ts` | 服务端入口（`server-only`），再导出 `envCore` |
| `config/envCore.ts` | 同上逻辑，供 `tsx` 单测直接引用（无 `server-only`） |
| `models/registry.ts` | **白名单**模型注册表（唯一合法 `model` 出口） |
| `tasks/taskPolicy.ts` | **任务分工总表**（直接依赖 `envCore`/`modeCore`，无 `server-only`，便于单测与 Next 服务端共用） |
| `playRealtime/*` | 玩家实时链路：**控制面预检**（`PLAYER_CONTROL_PREFLIGHT`）+ 规则快照 + 可选 MiniMax 局部增强 |
| `tasks/routing.ts` | 兼容 re-export（新代码请用 `taskPolicy`） |
| `router/execute.ts` | 超时 + 重试 + 熔断 + 埋点 + 流式/非流式执行 |
| `providers/*` | 各厂商官方 HTTP 请求体构造（无 SDK 耦合点） |
| `stream/sanitize.ts` | 剥离 `reasoning_content` 等，仅 `role`+`content` 上行 |
| `stream/openaiLike.ts` | OpenAI 形态 SSE / JSON 解析归一 |
| `resilience/fetchWithRetry.ts` | 可重试 `fetch` |
| `fallback/circuitBreaker.ts` | 按 provider 进程内熔断 |
| `fallback/modelCircuit.ts` | 按 **modelId** 进程内熔断（与 provider 熔断联动） |
| `degrade/mode.ts` | 服务端入口；`modeCore.ts` 为无 `server-only` 实现（单测可用） |
| `errors/classify.ts` | 标准化失败类型（超时/429/5xx/JSON/空/流中断等） |
| `debug/routingRing.ts` | 近期路由报告环形缓冲（日志 + 管理端） |
| `telemetry/log.ts` | 结构化 `ai.telemetry` 日志（成本字段见 `usage`） |
| `service.ts` | **业务唯一推荐入口**（再导出 router / 配置工具） |

**Fallback / 熔断 / 降级** 的语义与状态机见 **`docs/ai-fallback.md`**。  
**成本、门控、缓存与观测** 见 **`docs/ai-governance.md`**。

## 核心入口

- **玩家实时 SSE**：`executePlayerChatStream`（固定 `PLAYER_CHAT` 策略）
- **后台/异步 JSON**：`executeChatCompletion({ task })`（**禁止**对 `PLAYER_CHAT` 调用）
- **环境**：`resolveAiEnv`、`anyAiProviderConfigured`
- **调试**：`explainTaskRouting(task)`、`exportTaskModelMatrixMarkdown()`（打印 Markdown 表）

## 白名单模型（与注册表一致）

- `deepseek-v3.2`：在线主链路默认主力
- `glm-5-air`：轻量控制 / 意图 / 安全初筛 / 降级
- `MiniMax-M2.7-highspeed`：**仅**感官增强类任务（见禁止表）
- `deepseek-reasoner`：**仅**离线/后台高智力任务（严禁 `PLAYER_CHAT` 等）

## 任务 → 模型映射（代码源：`tasks/taskPolicy.ts`）

> 与源码逐字一致；玩家链还会在 `full` 模式下并入 `AI_PLAYER_MODEL_CHAIN`（非法模型由禁止表剔除）。

| Task | Primary | Fallbacks | Stream | max_tokens | timeout_ms | budget | json_mode |
|------|---------|-----------|--------|------------|------------|--------|-----------|
| PLAYER_CHAT | deepseek-v3.2 | *(空；额外候选来自 env 链)* | true | 1408 | 60000 | critical | true |
| PLAYER_CONTROL_PREFLIGHT | glm-5-air | deepseek-v3.2 | false | 512 | 12000 | low | true |
| INTENT_PARSE | glm-5-air | deepseek-v3.2 | false | 640 | 15000 | low | true |
| SAFETY_PREFILTER | glm-5-air | deepseek-v3.2 | false | 384 | 10000 | low | true |
| RULE_RESOLUTION | deepseek-v3.2 | glm-5-air | false | 1792 | 45000 | high | true |
| COMBAT_NARRATION | deepseek-v3.2 | glm-5-air | false | 1280 | 45000 | high | true |
| SCENE_ENHANCEMENT | MiniMax-M2.7-highspeed | deepseek-v3.2 | false | 448 | 22000 | high | false |
| NPC_EMOTION_POLISH | MiniMax-M2.7-highspeed | deepseek-v3.2, glm-5-air | false | 384 | 18000 | high | false |
| WORLDBUILD_OFFLINE | deepseek-reasoner | deepseek-v3.2, glm-5-air | false | 3072 | 120000 | medium | true |
| STORYLINE_SIMULATION | deepseek-reasoner | deepseek-v3.2 | false | 6144 | 120000 | medium | true |
| DEV_ASSIST | deepseek-reasoner | deepseek-v3.2, glm-5-air | false | 3072 | 90000 | medium | true |
| MEMORY_COMPRESSION | deepseek-v3.2 | deepseek-reasoner, glm-5-air | false | 1792 | 30000 | medium | true |

### 禁止路由（模型 × 任务）

| Task | Forbidden models |
|------|------------------|
| PLAYER_CHAT | deepseek-reasoner, MiniMax-M2.7-highspeed |
| PLAYER_CONTROL_PREFLIGHT | deepseek-reasoner, MiniMax-M2.7-highspeed |
| INTENT_PARSE | deepseek-reasoner, MiniMax-M2.7-highspeed |
| SAFETY_PREFILTER | deepseek-reasoner, MiniMax-M2.7-highspeed |
| RULE_RESOLUTION | deepseek-reasoner, MiniMax-M2.7-highspeed |
| COMBAT_NARRATION | deepseek-reasoner, MiniMax-M2.7-highspeed |
| SCENE_ENHANCEMENT | deepseek-reasoner |
| NPC_EMOTION_POLISH | deepseek-reasoner |
| WORLDBUILD_OFFLINE | MiniMax-M2.7-highspeed |
| STORYLINE_SIMULATION | MiniMax-M2.7-highspeed |
| DEV_ASSIST | MiniMax-M2.7-highspeed |
| MEMORY_COMPRESSION | MiniMax-M2.7-highspeed |

### Fallback 策略（统一行为）

1. 按 **主模型 → fallback 列表** 生成有序链；`PLAYER_CHAT` 再并入 `AI_PLAYER_MODEL_CHAIN`（非法模型会被剔除）。
2. `MEMORY_COMPRESSION` / `DEV_ASSIST` 可将 `AI_MEMORY_MODEL` / `AI_ADMIN_MODEL` 置于链首（仍受禁止表约束）。
3. 过滤无 API Key 的厂商；熔断打开的 provider 跳过；**首个 HTTP 成功**即返回（`stopOnFirstSuccess`）。

## 环境变量摘要

- 密钥：`DEEPSEEK_API_KEY`、`ZHIPU_API_KEY`（或 `BIGMODEL_API_KEY`）、`MINIMAX_API_KEY`
- `AI_PLAYER_MODEL_CHAIN`：默认仅 `deepseek-v3.2,glm-5-air`（**不含** MiniMax；MiniMax 进主链路会被禁止表剔除）
- `AI_MEMORY_MODEL`、`AI_ADMIN_MODEL`
- 韧性：`AI_TIMEOUT_MS`、`AI_MAX_RETRIES`、`AI_CIRCUIT_FAILURE_THRESHOLD`、`AI_CIRCUIT_COOLDOWN_MS`
- 降级：`AI_OPERATION_MODE` 或 `AI_DEGRADE_MODE` = `full` | `safe` | `emergency`
- 调试：`AI_EXPOSE_ROUTING_HEADER=1` → 响应头携带路由快照（勿在生产对公网长期开启）

## 迁移与约束

- 业务代码禁止直接 `fetch` 厂商 API；须通过 `executePlayerChatStream` / `executeChatCompletion`。
- 新增任务：在 `TaskType` 增加枚举 → `TASK_POLICY` + `TASK_MODEL_FORBIDDEN` 各写一行 → 业务选用对应 `task`。
- 新增模型：在 `models/registry.ts` 登记 → 调整 `taskPolicy.ts` → **无需**改路由执行器核心逻辑。
