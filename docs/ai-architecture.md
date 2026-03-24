# VerseCraft 统一大模型基础设施（`src/lib/ai`）

**运维与切模型**：请先阅读 [`docs/ai-gateway.md`](ai-gateway.md)（网关架构、环境变量、本地/Coolify、故障排查）。

## 目录

| 路径 | 职责 |
|------|------|
| `logicalTasks.ts` | **玩法 / 业务推荐入口**：`generateMainReply`、`parsePlayerIntent`、`enhanceScene`、`runOfflineReasonerTask` 等（内部固定 `TaskType`） |
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
| `service.ts` | 再导出 `logicalTasks` + 路由层 `execute*` + 配置/工具（兼容旧 import） |

**Fallback / 熔断 / 降级** 见 **`docs/ai-fallback.md`**（语义仍适用，变量名已改为网关与角色）。  
**成本、门控、缓存** 见 **`docs/ai-governance.md`**。

## 核心入口

- **玩法与业务（首选）**：[`logicalTasks.ts`](../src/lib/ai/logicalTasks.ts) — `generateMainReply`、`parsePlayerIntent`、`enhanceScene`、`runOfflineReasonerTask`、`compressSessionMemory`；规则/战斗预留 `resolveRuleOutcome`、`narrateCombat`。
- **路由内核（测试 / 高级场景）**：`executePlayerChatStream`（仅 `PLAYER_CHAT`）、`executeChatCompletion({ task })`（**禁止**对 `PLAYER_CHAT` 调用）。
- **环境**：`resolveAiEnv`、`anyAiProviderConfigured`、`resolveGatewayPrimaryBinding`（需网关 URL + Key + `AI_MODEL_MAIN`）
- **调试**：`explainTaskRouting(task)`、`exportTaskModelMatrixMarkdown()`

## 逻辑角色（业务与路由唯一标识）

真实上游模型名只在 **环境变量** `AI_MODEL_MAIN` 等或 **one-api 控制台** 配置；代码中不出现厂商型号字符串。

| 角色 | 典型任务 | 环境变量 |
|------|----------|----------|
| `main` | 玩家主叙事、规则裁决、战斗叙述、记忆压缩默认 | `AI_MODEL_MAIN` |
| `control` | 控制面预检、意图、安全预筛 | `AI_MODEL_CONTROL` |
| `enhance` | 场景增强、情绪润色（过渡兼容角色） | `AI_MODEL_ENHANCE`（Phase 1 推荐映射到 `vc-main`） |
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
- **Phase 1 三部署推荐映射**：`AI_MODEL_MAIN=vc-main`、`AI_MODEL_CONTROL=vc-control`、`AI_MODEL_ENHANCE=vc-main`、`AI_MODEL_REASONER=vc-reasoner`
- **增强触发开关**：`AI_ENABLE_NARRATIVE_ENHANCEMENT`（默认关闭；仅控制“是否触发增强”，不删除逻辑角色与任务矩阵）
- **玩家链**：`AI_PLAYER_ROLE_CHAIN`；兼容旧 `AI_PLAYER_MODEL_CHAIN`（旧 id 映射为角色）
- **覆盖链首**：`AI_MEMORY_PRIMARY_ROLE` / 旧 `AI_MEMORY_MODEL`；`AI_DEV_ASSIST_PRIMARY_ROLE` / 旧 `AI_ADMIN_MODEL`
- **行为**：`AI_ENABLE_STREAM`、`AI_LOG_LEVEL`、`AI_REQUEST_TIMEOUT_MS`、`AI_MAX_RETRIES`、熔断与 `AI_OPERATION_MODE`

## 迁移与约束

- 业务禁止直接 `fetch` 大模型；须通过 `executePlayerChatStream` / `executeChatCompletion`。
- 新增任务：扩展 `TaskType` → `TASK_POLICY` + `TASK_ROLE_FORBIDDEN`。
- 换模型：优先改 **one-api**；必须改应用时只动 **环境变量**（或极少数集中配置），不动业务文件。

## Phase 3：World Engine 后台化（离线 reasoner）

- `reasoner` 仅用于离线任务：`WORLDBUILD_OFFLINE` / `STORYLINE_SIMULATION`，不进入 `PLAYER_CHAT` 主链路。
- `/api/chat` 在终帧后仅异步入队 `WORLD_ENGINE_TICK`，不等待 reasoner 返回。
- worker（`scripts/vc-worker.ts`）消费 `WORLD_ENGINE_TICK`，调用 `runOfflineReasonerTask({ kind: "worldbuild" })`。
- reasoner 输出必须为严格 JSON，结构包括：
  - `npc_next_actions[]`
  - `world_events_to_schedule[]`
  - `story_branch_seeds[]`
  - `consistency_warnings[]`
  - `player_private_hooks[]`
- 结果落库：
  - `world_engine_runs`（运行记录、状态、去重键）
  - `world_engine_event_queue`（可查询事件队列）
  - `world_engine_agenda_snapshots`（会话 agenda 快照）
- Redis 仅用于去重锁/热缓存协调；长期事实源为 PostgreSQL。
- 成功写入后递增 `vc_world_meta.world_revision`，供在线 retrieval 对齐后台增量版本。
