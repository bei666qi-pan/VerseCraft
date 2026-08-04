# Design: integrate-bounded-dm-agent-tools

## Architecture

### Call Chain

```
玩家输入
  → 300ms 内本地/SSE 反馈
  → fast / mechanics / slow lane 路由
  → [mechanics lane] 模型选择工具或生成严格 Tool Plan
  → Schema Validator
  → 权限、会话、世界、场景和前置条件检查
  → 领域规则计算
  → 生成权威 Typed StateDelta
  → 幂等与单次提交保护
  → 注入真实执行结果，生成叙事
  → NPC consistency / epistemic / narrative validator
  → resolveDmTurn
  → commitTurn
  → __VERSECRAFT_FINAL__
  → 非阻塞 analytics / world tick
```

### Key Design Decisions

1. **Workflow over Agent**: DM Agent 是 Turn Compiler 中的受控命令层，不是自由循环的多 Agent 系统
2. **State Delta First**: 工具结果转换为标准 DM JSON 字段，重新汇入现有收口链路
3. **No Bypass**: Agent 路径不会直接输出 `__VERSECRAFT_FINAL__` 后 return，必须经过整个 final hooks 链
4. **Lane Routing**: 只有明确的 mechanics intent 才进入工具路径
5. **Bounded Tool Loop**: 默认最多 2 轮，硬上限 3 轮

### Module Responsibility

| Module | Responsibility |
|--------|---------------|
| `src/lib/ai/tools/runToolLoop.ts` | 通用有界 tool-calling 循环（已有，需完善） |
| `src/lib/ai/tools/dmAgentTypes.ts` | DM Agent 专用类型 |
| `src/lib/ai/tools/dmToolSchemas.ts` | 工具 JSON Schema 定义 |
| `src/lib/ai/tools/dmToolHandlers.ts` | 工具处理器（参数校验 → 领域服务调用） |
| `src/lib/ai/tools/gameDomainServices.ts` | 领域服务（业务规则计算） |
| `src/lib/ai/tools/dmAgentOrchestrator.ts` | DM Agent 协调器 |
| `src/lib/ai/tools/dmAgentRouteIntegration.ts` | /api/chat 集成入口 |
| `src/lib/ai/tools/dmServerStateAdapter.ts` | 服务端状态适配 |
| `src/lib/ai/tools/dmAgentSseFeedback.ts` | SSE 状态帧 |
| `src/lib/ai/tools/dmAuditLog.ts` | 审计日志 |
| `src/lib/ai/tools/dmToolCache.ts` | 只读工具缓存 |

### StateDelta Merger

Agent 工具执行后的结果需要合并到标准 DM JSON 字段：

- `issue_quest` → `new_tasks[]`
- `update_quest_progress` → `task_updates[]`
- `forge_weapon` → `consumed_items[]` + `awarded_items[]` + `currency_change` + `weapon_updates[]`
- `start_combat` → `combat_state` 字段
- `resolve_combat_action` → `hp_delta` + `combat_updates[]`
- `consume_materials` → `consumed_items[]`
- `grant_item` → `awarded_items[]`

使用 `src/lib/ai/tools/dmAgentStateMerger.ts` 进行标准化合并。

### Idempotency

复用 `analytics.idempotencyKey` 机制，通过 `requestId + toolName + argsHash` 构建幂等键。
修复当前进程内 Map 方案为可持久化方案。

### Feature Flag

`VERSECRAFT_ENABLE_DM_AGENT=true` 启用，默认 `false`。
关闭后保持与改造前完全一致的旧 DM 行为。

## Phase 1 Corrections (2026-08-03)

### Issues Found
1. **No routing gate**: The DM Agent path was entered for ALL inputs when `VERSECRAFT_ENABLE_DM_AGENT=true`, regardless of mechanics intent.
2. **agentUsed=true without tools**: `tryRunDmAgentTurn` returned `agentUsed=true` whenever `runDmAgentTurn` returned non-null, even when no tools were called.
3. **Bypassed final chain**: The DM Agent path directly wrote `__VERSECRAFT_FINAL__` and closed the writer, skipping NPC consistency, narrative validation, explicit commit, analytics, and background world tick.

### Fixes Applied
1. Added `shouldAttemptDmAgent(latestUserInput)` call from `dmMechanicsIntentRouter.ts` as a gate before entering DM Agent path.
2. Changed `if (result)` to `if (result && result.toolsUsed)` in `tryRunDmAgentTurn`.
3. Replaced the direct FINAL write with the complete chain: NPC consistency → validateNarrative → commitTurn → FINAL → background tick → analytics.

### Updated Call Chain
```
player input
  → shouldAttemptDmAgent() gate (deterministic, sync, no LLM)
  → [mechanics only] bounded tool stage
  → candidate DM record
  → normalize
  → applyNpcConsistencyPostGeneration (minimal args)
  → resolveDmTurn
  → validateNarrative
  → commitTurn
  → exactly one FINAL
  → non-blocking background world tick
  → chat_request_finished analytics
```
