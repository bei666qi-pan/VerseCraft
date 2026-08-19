## 1. 权威状态与移动

- [x] 1.1 删除 `resolveDmTurn` 中所有 narrative-to-conflict/damage/sanity fallback，并增加无依据状态不提交测试
- [x] 1.2 删除地点 guard 中 narrative-to-location 推断，确保正文移动不改变权威地点
- [x] 1.3 扩展 authored movement 的邻接别名解析，覆盖唯一 `进入302`、未知、跨层和歧义测试

## 2. 战斗、NPC 与物品治理

- [x] 2.1 为冲突、伤害、理智和死亡 delta 增加结构化/注册机制 causality gate 与 audit flags
- [x] 2.2 统一过滤关系、位置、记忆、图鉴等结构化 NPC 写入中的未注册或占位标识
- [x] 2.3 增加明确玩家物品使用抽取与权威背包校验，覆盖幻觉物品和普通场景道具负例

## 3. 最终一致性与性能

- [x] 3.1 在 finalization 中核对 narrative/options 与 resolved location/death/item/NPC/mechanics facts，禁止文本回写状态
- [x] 3.2 将至多一次 Writer-only repair 约束在共享 final deadline，失败时返回 audited safe fallback
- [x] 3.3 用 `CHAT_LATENCY_BUDGET` 替换分散的在线/eval timeout 常量，保持 SSE 与 DM JSON contract

## 4. 验证与规范

- [x] 4.1 运行 resolve、movement、entity/item、narrative validator 和 SSE 定向回归测试（原定向套件 215 tests passed；真实 speedrun 补丁后 guards 89/89；r19/r20 follow-up 后 movement/durable/entity/item/protocol/SSE 组合 166/166）
- [x] 4.2 运行完整 unit、lint、build、`test:e2e:contract` 与 `benchmark:chat:mock`（显式 full unit: node 3945/3945 + Vitest 295/295；promptfoo 172/172；产物迁移后 quick gate 再次 4 pass/0 fail；lint 0 errors/120 warnings；build passed；contract 5 passed/6 conditional skipped；benchmark 10/10，p95 status/text/final=47/141/442ms）
- [x] 4.3 同步 delta specs、严格验证 change，并记录实际验证证据（同步并补充 5 个 capabilities；`openspec validate clean-test-integrity --strict` 与 `openspec validate enforce-authoritative-turn-consistency --strict` 均通过；`git diff --check` 通过）
