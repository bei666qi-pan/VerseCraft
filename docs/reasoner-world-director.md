# Reasoner World Director

VerseCraft 的 reasoner 不进入玩家实时主链路。World Director 是后台闭环：监测回合信号，生成导演计划，校验并写入 agenda，再把少量 due agenda 作为软提示给下一轮主笔选择性采用。

## 边界

- `PLAYER_CHAT` 继续固定为 `main` 角色流式输出，`taskPolicy` 禁止 `reasoner` / `enhance`。
- `/api/chat` 不等待 reasoner；只在生成 prompt 前做短超时 due agenda 查询，失败时 fail-open。
- reasoner 输出不直接展示给玩家，不复制 `player_private_hooks`，不把隐藏真相、NPC 私有知识或后台 hook 注入 prompt。
- 所有模型调用仍走 `logicalTasks` / `executeChatCompletion` / `taskPolicy`，业务代码不直接 fetch 模型。

## 生命周期

1. `/api/chat` 完成 DM JSON 收口和 `commitTurn` 后，调用 `scheduleBackgroundWorldTick` 非阻塞入队。
2. worker 消费 `WORLD_ENGINE_TICK`，通过 `runOfflineReasonerTask({ kind: "worldbuild" })` 请求 reasoner。
3. reasoner 只能输出 `director_plan_v1` JSON。
4. `parseWorldEngineDeltaJson` 做 schema 解析、旧字段兼容、clamp 和高风险 plan 拒绝。
5. `validateDirectorPlan` 做确定性校验；可选 `DIRECTOR_PLAN_CRITIC` 只做验收。
6. 通过 `world_engine_runs`、`world_engine_event_queue`、`world_engine_agenda_snapshots`、`world_engine_director_state` 幂等写入。
7. soft 模式下，下一轮 prompt 通过 `buildServerDirectorHintBlock` 注入 1-3 条 due agenda。
8. 本轮注入过的 agenda 在 final 写出后标记 `injected`，过期项标记 `expired`。

## Schema

`DirectorPlan` 的根字段为：

- `schema_version: "director_plan_v1"`
- `director_intent`
- `current_phase` / `target_phase`
- `pacing_assessment`
- `risk_assessment`
- `reveal_policy`
- `npc_next_actions`
- `world_events_to_schedule`
- `story_branch_seeds`
- `consistency_warnings`
- `player_private_hooks`

旧版五数组输出仍可解析，但会被提升为 `director_plan_v1`。缺少 `event_code`、`title` 或 `injection_hint` 的 agenda 事件会直接丢弃。`agency_risk`、`spoiler_risk` 或 `safety_risk` 为 `high` 时不允许写入 agenda。

## 状态机

Agenda 状态：

- `pending -> due -> injected -> resolved`
- `pending -> expired`
- `due -> expired`
- `candidate -> rejected`

PostgreSQL 是最终幂等层；`session_id + event_code + dedup_key` 不允许重复。Redis 去重只用于热路径优化。

## 灰度

- `AI_ENABLE_WORLD_DIRECTOR`
- `AI_DIRECTOR_MODE=off|shadow|soft`
- `AI_ENABLE_DIRECTOR_HINT_INJECTION`
- `AI_ENABLE_DIRECTOR_CRITIC`
- `AI_DIRECTOR_MAX_DUE_HINTS`
- `AI_DIRECTOR_MIN_TRIGGER_GAP_TURNS`
- `AI_DIRECTOR_MAX_PENDING_AGENDA_PER_SESSION`
- `AI_DIRECTOR_AGENDA_DEFAULT_TTL_TURNS`
- `AI_DIRECTOR_AGENDA_QUERY_TIMEOUT_MS`

`shadow` 会生成、校验、写入和记录 telemetry，但不影响主叙事。`soft` 才允许 due agenda 进入 prompt，且主模型可以忽略。

## Eval

运行：

```bash
pnpm eval:director
```

fixtures 位于 `src/lib/worldEngine/__fixtures__/directorEvalCases.json`，覆盖正常探索、连续检查停滞、高压恢复、接近真相但不能揭露、NPC 私有知识、重复 location 无移动、任务更新、clue threshold、due hook、agenda 过期、bad JSON、高 agency/spoiler risk、duplicate event 等。

## 回滚

最快回滚方式是设置：

```bash
AI_ENABLE_WORLD_DIRECTOR=false
AI_DIRECTOR_MODE=off
AI_ENABLE_DIRECTOR_HINT_INJECTION=false
AI_ENABLE_DIRECTOR_CRITIC=false
```

这会停止新 tick 调度和 prompt 注入。已写入的 agenda 保留在数据库中，后续可通过状态字段排查或清理，不影响 `/api/chat` SSE 契约。
