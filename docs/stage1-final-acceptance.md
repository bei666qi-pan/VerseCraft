# Stage 1 最终联调与验收清单

## 功能闭环验收项

- [ ] B1 安全中枢：B1 不发生 hostile 伤害（业务层 guard 生效）
- [ ] 任务闭环：`new_tasks/task_updates` 能进入状态并在 UI 展示
- [ ] 复活闭环：死亡后支持重开/复活双路径
- [ ] 最近锚点：按图距离复活到最近已解锁锚点
- [ ] 12h 快进：复活后时间、任务、世界状态同步推进
- [ ] 掉落转移：玩家物品转移出背包并有归属账本
- [ ] 7F 阴谋：具备结构化触发条件与去重 worldFlags
- [ ] NPC 闭环：可被 registry 引用、图鉴记录、任务引用、上下文注入
- [ ] Prompt 架构：stable prompt 缩短，runtime packet + retrieval 正常

## 稳定性验收项

- [ ] 旧存档可迁移，不崩溃
- [ ] SSE 与 DM JSON 契约保持稳定
- [ ] 单测全绿（含 Stage 1 新增测试）
- [ ] 无新增 lints

## 观测指标建议

- `stableCharLen`、`dynamicCharLen`
- `runtimePacketChars`、`runtimePacketTokenEstimate`
- `lorePacketChars`、`lorePacketTokenEstimate`
- `firstChunkLatencyMs`（TTFT）
- 最终 JSON 解析成功率

