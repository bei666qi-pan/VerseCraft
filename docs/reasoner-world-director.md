# World Director 工作流

权威边界见 `CONTEXT.md` 与 ADR-0001/0002。World Director 是 FINAL 之后的异步工作流，只消费 `CommittedTurnReceipt`，不能回写或替代当前玩家回合。

## 生命周期

1. `TurnFinalizer` 完成状态提交并发送唯一 FINAL。
2. `scheduleBackgroundWorldTick` 以 `worldId + mapId + sessionId + turnIndex` 幂等入队。
3. worker 读取已提交回合、唯一事件 agenda、当前章节信号和确定性的 `ActorContextProjector`。
4. `WorldDirectorWorkflow` 在一次模型调用内共同生成 NPC 行动、agenda、章节方向、约束和来源引用。
5. 输出先规范化，再经认知、玩家自主权、死亡连续性、世界作用域和能力边界的确定性减法校验。
6. 接受集合在同一事务中写入 run、`world_engine_event_queue`、Director 状态与独立的 `social_event_ledger`。
7. 下一回合按当前状态和到期事件即时投影 `DirectorDirective`；不保存重复 prompt 文本。

## 硬预算

- 同一世界/地图/会话/回合最多一个 job。
- 每个 job 最多一次模型调用，输出最多 2048 token，硬截止 45 秒。
- 默认至少间隔四回合；不满足触发条件时为零调用。
- 每次真实调用必须关联 `requestId/runId/task/lane/round` 和供应商 usage；usage 缺失时成本为空并标记 `usage_unavailable`，不得字符估算。

## 持久化

- `world_engine_event_queue` 是唯一 Director agenda。
- `social_event_ledger` 是独立社交领域账本，继续保留。
- `world_engine_agenda_snapshots`、`world_engine_hint_envelopes` 和五张旧统计表无运行时读写者，迁移时无依赖删除。
- PostgreSQL 是 job/run 幂等真相源；Redis 只能做缓存。

## 禁止恢复

- 客户端 Story Director / IncidentQueue
- 独立 Actor Simulation 模型
- LLM Critic
- Director Tool Loop
- LangGraph 双实现

## 验证入口

```bash
pnpm exec tsx --conditions=react-server --test src/lib/worldEngine/worldDirectorWorkflow.test.ts
pnpm eval:director
pnpm eval:social-world
pnpm eval:npc-consistency:mock
```

数据库集成用例必须使用专用本地数据库并显式设置 `VERSECRAFT_RUN_DIRECTOR_PG_INTEGRATION=1`；条件 skip 不算通过。
