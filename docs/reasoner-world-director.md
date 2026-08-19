# Reasoner World Director

VerseCraft 的 reasoner 不进入玩家实时主链路。World Director 是后台闭环：监测已提交回合的结构化信号，生成导演候选，依次规范化、校验、执行约束和世界能力过滤，再将最终接受集合以 `DirectorHintEnvelope` 提交。后续 Writer 只能选择性采用已提交且对当前回合有效的 envelope。

## 边界

- `PLAYER_CHAT` 继续固定为 `main` 角色流式输出，`taskPolicy` 禁止 `reasoner` / `enhance`。
- `/api/chat` 不等待 reasoner；只在生成 prompt 前按 `worldId + mapId + sessionId` 做 80ms 截止的 committed hint envelope 查询，失败时 fail-open。
- reasoner 输出不直接展示给玩家，不复制 `player_private_hooks`，不把隐藏真相、NPC 私有知识或后台 hook 注入 prompt。
- 所有模型调用仍走 `logicalTasks` / `executeChatCompletion` / `taskPolicy`，业务代码不直接 fetch 模型。

## 生命周期

1. `/api/chat` 完成 DM JSON 收口和 `commitTurn` 后，调用 `scheduleBackgroundWorldTick` 非阻塞入队。
2. worker 消费显式世界/地图作用域的 `WORLD_ENGINE_TICK` V2，建立或恢复幂等 run。
3. worker 加载作用域 facts、agenda、Director state 和 capability profile，重新校验客户端节奏/章节信号。
4. 确定性选择最多 3 名 NPC，可选执行一次有界 batch Actor Projection，失败时仍继续单 Director。
5. reasoner 只能输出 `director_plan_v1` candidate。candidate 依次经过 normalization、`validateDirectorPlan`、`enforceDirectorPlan` 和世界 capability validator。
6. 仅中风险或新事件类型进入 critic；critic 只能从已接受集合中减少项目。
7. run、agenda、Director state、social deltas 和 sanitized `DirectorHintEnvelope` 在同一事务内提交。被拒绝的 candidate 不得进入快照、agenda 或 hint。
8. soft 模式下，后续回合通过 `buildServerDirectorHintBlock` 加载通过作用域、生命周期和回合窗口检查的 committed envelope。

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

PostgreSQL 是 job 与 run 的最终幂等层；job 使用 `job_type + idempotency_key`，run 使用显式 `world_id + map_id + session_id + dedup_key` 作用域。Redis 只可作缓存，不得先于 PostgreSQL 锁住任务。

## 灰度

- `AI_ENABLE_WORLD_DIRECTOR`
- `AI_DIRECTOR_MODE=off|shadow|soft`
- `AI_DIRECTOR_DARK_MOON_MODE=off|shadow|soft`
- `AI_DIRECTOR_XINGNI_MODE=off|shadow|soft`
- `VERSECRAFT_ENABLE_ACTOR_SIMULATION=true|false`
- `VERSECRAFT_ACTOR_SIMULATION_MODE=off|batch_shadow|batch_soft`
- `AI_ENABLE_DIRECTOR_HINT_INJECTION`
- `AI_ENABLE_DIRECTOR_CRITIC`
- `AI_DIRECTOR_MAX_DUE_HINTS`
- `AI_DIRECTOR_MIN_TRIGGER_GAP_TURNS`
- `AI_DIRECTOR_MAX_PENDING_AGENDA_PER_SESSION`
- `AI_DIRECTOR_AGENDA_DEFAULT_TTL_TURNS`
- `AI_DIRECTOR_AGENDA_QUERY_TIMEOUT_MS`

`shadow` 会生成、校验并记录结构化 telemetry，但不产生 Writer 可消费的 hint。`soft` 才允许已验证、已提交且当前适用的 `DirectorHintEnvelope` 进入 Writer prompt，Writer 仍可在 `must/forbid` 约束内选择性采用方向。

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
