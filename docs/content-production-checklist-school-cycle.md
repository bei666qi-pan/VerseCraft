# 学制循环 · 高魅力线 — 后续内容生产清单

本文是 **执行清单**，不是设定圣经。目标：在不大改系统的前提下，把任务、叙事与 registry/packet/bootstrap 对齐，避免出戏与剧透失控。

## 写前必读（5 分钟）

- [`docs/worldview-school-cycle-acceptance.md`](worldview-school-cycle-acceptance.md) — 验收边界与风险  
- [`docs/world-packets-school-cycle.md`](world-packets-school-cycle.md) — runtime 包语义  
- [`docs/prompt-integration-school-cycle.md`](prompt-integration-school-cycle.md) — stable 与 dynamic 分工  

## 高魅力六人：单角色检查表

对 **N-015 / N-020 / N-010 / N-018 / N-013 / N-007** 任意支线，确认：

1. **表层**：`npcProfiles` 中「公寓职能面 / 校源面」仍成立；对话开局不点名校籍、辅锚编号、七人闭环定论。  
2. **门闸**：deep 档才允许辅锚/校源机制话术；fracture 只给违和、既视感、拒并队硬理由。  
3. **任务 id**：新任务尽量在标题或回写里能命中 `majorNpcRelinkRegistry` 所需子串，或改用 **worldFlags / 结构化 task id**（推荐后续改造）。  
4. **检索**：若新增长设定，优先写成 `truth:pkg:*` 风格专条或扩写 `majorNpcBranchSeeds` 式短种子，**不要**塞进 stable。  
5. **样例种子**：见 `registry/majorNpcBranchSeeds.ts`（每人一条 `truth:branch:*`，带 `hook:*` tag）。

## 世界观/global 事件检查表

- 十日 / 龙月 / 闪烁：数值与文案变更时，同步核对 `cycleMoonFlashRegistry`、`cycle_time_packet`、`cycle_loop_packet`。  
- 七锚 / 校源：切片 `revealMinRank` 变更时，同步 `schoolCycleCanon`、`revealRegistry`、`schoolCycleRetrievalSeeds`。  
- Bootstrap：改完跑 `buildRegistryWorldKnowledgeDraft` 相关单测或 `pnpm test:unit`。

## 交付前最小验证

```bash
pnpm test:unit
```

重点文件：`worldSchoolCycleAcceptance.test.ts`、`worldviewSchoolCycleClosure.test.ts`、`majorNpcQuestHooks.test.ts`（questHooks ↔ relink 针 ↔ 支线种子）、`runtimeContextPackets.test.ts`、`majorNpcRelinkRegistry.test.ts`。

**工程真源**

- 任务 hook 字符串：`npcProfiles` → `questHooksForMajorNpc`（`majorNpcQuestHooks.ts`）
- 重连任务追踪子串：`partyRelinkRegistry.relinkTriggerTasks` → `relinkTriggerNeedlesForMajorNpc`
- 支线 bootstrap：`majorNpcBranchSeeds` 通过 `profileHookIndex` 从 profile 派生 `relatedQuestHook`，勿手写重复字符串

**客户端存档**：全局持久化在 `HydrationProvider` 完成 `rehydrate` 后才 `setHydrated(true)`，避免未恢复存档就进 `/play` 被踢回铸造页。

## 刻意不做（避免范围爆炸）

- 不重做 UI、service nodes、战斗核心循环、普通 NPC 全表。  
- 不把「更宏大的设定」堆进单文件；能拆专条就拆专条。  

---

更新本文时只增 **可执行项**，少写剧情散文。
