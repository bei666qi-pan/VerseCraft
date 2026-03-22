# VerseCraft 统一大模型基础设施（`src/lib/ai`）

## 目录

| 路径 | 职责 |
|------|------|
| `config/env.ts` | 服务端入口（`server-only`），再导出 `envCore` |
| `config/envCore.ts` | 网关 URL/Key、`AI_MODEL_*` 解析（无 `server-only`，供单测） |
| `models/logicalRoles.ts` | 逻辑角色 `main` / `control` / `enhance` / `reasoner` |
| `models/registry.ts` | 再导出 logicalRoles（兼容旧 import 路径） |
| `gateway/openaiCompatible.ts` | one-api 用 OpenAI Chat Completions 请求体 |
| `tasks/taskPolicy.ts` | **任务分工总表**（角色链 + 禁止表） |
| `playRealtime/*` | 玩家实时链路：控制面预检 + 规则快照 + 可选增强 |
| `tasks/routing.ts` | 兼容 re-export（新代码请用 `taskPolicy`） |
| `router/execute.ts` | 超时 + 重试 + 熔断 + 埋点 + 流式/非流式执行 |
| `providers/index.ts` | 单一网关工厂（`oneapi`） |
| `stream/sanitize.ts` | 剥离 `reasoning_content` 等，仅 `role`+`content` 上行 |
| `stream/openaiLike.ts` | OpenAI 形态 SSE / JSON 解析归一 |
| `resilience/fetchWithRetry.ts` | 可重试 `fetch` |
| `fallback/circuitBreaker.ts` | 按 provider（`oneapi`）进程内熔断 |
| `fallback/modelCircuit.ts` | 按 **逻辑角色** 进程内熔断 |
| `degrade/mode.ts` | 服务端入口；`modeCore.ts` 为无 `server-only` 实现 |
| `errors/classify.ts` | 标准化失败类型 |
| `debug/routingRing.ts` | 近期路由报告环形缓冲 |
| `telemetry/log.ts` | 结构化 `ai.telemetry` 日志 |
| `service.ts` | **业务唯一推荐入口** |

**Fallback / 熔断 / 降级** 见 **`docs/ai-fallback.md`**（语义仍适用，变量名已改为网关与角色）。  
**成本、门控、缓存** 见 **`docs/ai-governance.md`**。

## 核心入口

- **玩家实时 SSE**：`executePlayerChatStream`（固定 `PLAYER_CHAT` 策略）
- **后台/异步 JSON**：`executeChatCompletion({ task })`（**禁止**对 `PLAYER_CHAT` 调用）
- **环境**：`resolveAiEnv`、`anyAiProviderConfigured`（需网关 URL + Key + `AI_MODEL_MAIN`）
- **调试**：`explainTaskRouting(task)`、`exportTaskModelMatrixMarkdown()`

## 逻辑角色（业务与路由唯一标识）

真实上游模型名只在 **环境变量** `AI_MODEL_MAIN` 等或 **one-api 控制台** 配置；代码中不出现厂商型号字符串。

| 角色 | 典型任务 | 环境变量 |
|------|----------|----------|
| `main` | 玩家主叙事、规则裁决、战斗叙述、记忆压缩默认 | `AI_MODEL_MAIN` |
| `control` | 控制面预检、意图、安全预筛 | `AI_MODEL_CONTROL` |
| `enhance` | 场景增强、情绪润色 | `AI_MODEL_ENHANCE` |
| `reasoner` | 离线世界构建、剧情推演、管理洞察 | `AI_MODEL_REASONER` |

## 任务 → 角色映射（源码：`tasks/taskPolicy.ts`）

> `full` 模式下 `PLAYER_CHAT` 会并入 `AI_PLAYER_ROLE_CHAIN`（或兼容解析 `AI_PLAYER_MODEL_CHAIN`）。

| Task | PrimaryRole | FallbackRoles | Stream | json_mode（请求体） |
|------|-------------|---------------|--------|---------------------|
| PLAYER_CHAT | main | *(env 链)* | true | true |
| PLAYER_CONTROL_PREFLIGHT | control | main | false | true |
| INTENT_PARSE | control | main | false | true |
| SAFETY_PREFILTER | control | main | false | true |
| RULE_RESOLUTION | main | control | false | true |
| COMBAT_NARRATION | main | control | false | true |
| SCENE_ENHANCEMENT | enhance | main | false | false |
| NPC_EMOTION_POLISH | enhance | main, control | false | false |
| WORLDBUILD_OFFLINE | reasoner | main, control | false | true |
| STORYLINE_SIMULATION | reasoner | main | false | true |
| DEV_ASSIST | reasoner | main, control | false | true |
| MEMORY_COMPRESSION | main | reasoner, control | false | true |

### 禁止路由（角色 × 任务）

| Task | Forbidden roles |
|------|-------------------|
| PLAYER_CHAT | reasoner, enhance |
| 控制面 / 在线裁决类 | reasoner, enhance |
| SCENE_ENHANCEMENT / NPC_EMOTION_POLISH | reasoner |
| 离线推演类 | enhance |
| MEMORY_COMPRESSION | enhance |

## 环境变量摘要

- **网关**：`AI_GATEWAY_PROVIDER`（默认 `oneapi`）、`AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`
- **角色 → 上游模型名**：`AI_MODEL_MAIN`、`AI_MODEL_CONTROL`、`AI_MODEL_ENHANCE`、`AI_MODEL_REASONER`
- **玩家链**：`AI_PLAYER_ROLE_CHAIN`；兼容旧 `AI_PLAYER_MODEL_CHAIN`（旧 id 映射为角色）
- **覆盖链首**：`AI_MEMORY_PRIMARY_ROLE` / 旧 `AI_MEMORY_MODEL`；`AI_DEV_ASSIST_PRIMARY_ROLE` / 旧 `AI_ADMIN_MODEL`
- **行为**：`AI_ENABLE_STREAM`、`AI_LOG_LEVEL`、`AI_REQUEST_TIMEOUT_MS`、`AI_MAX_RETRIES`、熔断与 `AI_OPERATION_MODE`

## 迁移与约束

- 业务禁止直接 `fetch` 大模型；须通过 `executePlayerChatStream` / `executeChatCompletion`。
- 新增任务：扩展 `TaskType` → `TASK_POLICY` + `TASK_ROLE_FORBIDDEN`。
- 换模型：优先改 **one-api**；必须改应用时只动 **环境变量**（或极少数集中配置），不动业务文件。
