# AI 多模型 Fallback、熔断与降级（生产策略）

本文描述 `src/lib/ai` 中与**故障隔离**相关的运行时行为，与 `docs/ai-architecture.md` 互补。

## 状态机（请求级）

1. **解析运行模式** `resolveOperationMode()` → `full` | `safe` | `emergency`（`AI_OPERATION_MODE` / `AI_DEGRADE_MODE`）。
2. **按任务取有序角色链** `resolveOrderedRoleChain(task, mode)`：主角色优先 **main**，再按任务策略与禁止表追加；`emergency` 下玩家主链路仅 **main**（且需 `AI_MODEL_MAIN` 已配置）。
3. **逐角色尝试**（流式：`executePlayerChatStream`；非流式：`executeChatCompletion`），请求均发往 **同一** `AI_GATEWAY_BASE_URL`，`model` 字段来自对应 `AI_MODEL_*`。  
   - 若角色处于**熔断打开**（网关 provider 或 **logicalRole** 维度），记为跳过类失败，**不发起 HTTP**，直接下一角色。  
   - 发起请求；失败则 `classifyAiFailure` 标准化原因（超时 / 429 / 5xx / 解析 / 空内容 / 流中断等）。  
   - 若判定为**应计入熔断**的失败，写入 `recordModelFailure` / provider 熔断器。  
   - 若判定为**应换角色**（如可重试类已用尽、或 JSON/空内容无效），**换链上下一角色**，fallback 计数 +1。  
4. **成功**时 `recordModelSuccess`，返回内容 + **路由报告**（intendedRole、actualLogicalRole、fallback 次数、失败摘要、运行模式）。

**约束**：不在单请求内做「多模型串联润色」；仅 **failover**，避免延迟叠加。

## 软失败 vs 硬失败（分类用途）

| 类别 | 典型情况 | 路由行为 |
|------|-----------|----------|
| 可恢复 / 限流 | 429、部分 5xx、超时（在重试策略内） | 重试当前模型或换模型（由 `shouldAdvanceToNextModel` 等决定） |
| 不可恢复内容 | 空正文、非法 JSON（需 JSON 的任务）、流式无有效增量 | 尽快换下一模型，不阻塞玩家 |
| 熔断跳过 | provider / logicalRole 熔断打开 | 不撞上游，直接下一候选 |

具体枚举与规则见 `src/lib/ai/errors/classify.ts`、`src/lib/ai/types/routingErrors.ts`。

## 任务接管示例

1. **PLAYER_CHAT（流式）**  
   - 首选 **main**；失败或无效输出 → **control**（若链中有且未熔断）。  
   - 多 pass 流式重连时携带 `skipRoles`，避免重复打已判定失败的角色。

2. **INTENT_PARSE / SAFETY_PREFILTER**  
   - 主 **control**；失败 → **main** 同任务链内 fallback。

3. **SCENE_ENHANCEMENT / NPC_EMOTION_POLISH**  
   - 主 **enhance**；失败 → **main**（及必要时 **control**）。增强失败不阻塞主流程（调用方处理 `executeChatCompletion` 结果）。

4. **运行模式**  
   - `full`：主角色 + env 玩家链合并。  
   - `safe`：策略内主备，不合并 `AI_PLAYER_ROLE_CHAIN` 额外项。  
   - `emergency`：玩家链仅 **main**。

## 可观测性

- **服务端日志**：`pushAiRoutingReport` → 环形缓冲（`type: "ai.routing"`），与 telemetry 配合。  
- **管理后台**：仪表盘「大模型路由与熔断」→ `GET /api/admin/ai-routing`（需管理员 shadow 会话）。  
- **可选响应头**：`AI_EXPOSE_ROUTING_HEADER=1` 时下发 `X-AI-Routing-Http-Snapshot`（base64url JSON 快照，仅调试）。

## 玩家实时链路（控制面 → 主模型流式 → 可选增强）

1. **控制面**：`POST /api/chat` 在组装 DM system prompt 前调用 `PLAYER_CONTROL_PREFLIGHT`（GLM→V3.2），将意图/槽位/风险标签写入 system 的「控制层」小节（非并行抢答）。`emergency` 模式跳过预检以缩短首包路径。  
2. **主模型**：仅 **DeepSeek-V3.2 优先**流式生成整段 JSON；失败时仍按 `PLAYER_CHAT` 链 failover（默认含 GLM）。  
3. **增强层**：`full` 模式且规则命中时，在**上游流结束且输出合法**后，单次调用 MiniMax（或策略 fallback）改写**开头片段**；通过 `__VERSECRAFT_FINAL__:` 一条 SSE **整体替换**客户端缓冲，避免多源 token 交错。

## 相关源码索引

| 模块 | 路径 |
|------|------|
| 失败分类 | `lib/ai/errors/classify.ts` |
| 运行模式 | `lib/ai/degrade/mode.ts` |
| 模型熔断 | `lib/ai/fallback/modelCircuit.ts` |
| 任务链 | `lib/ai/tasks/taskPolicy.ts` |
| 执行与流式 fallback | `lib/ai/router/execute.ts` |
| 路由环形日志 | `lib/ai/debug/routingRing.ts` |
