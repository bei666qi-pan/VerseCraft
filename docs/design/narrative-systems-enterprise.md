# VerseCraft：任务 / 目标 / 线索 / 物品系统——企业级设计说明

> **文档性质**：基于仓库内**已合并实现**整理，供后续迭代与交接使用。  
> **关联文档**：[`docs/phase6-system-linkage.md`](../phase6-system-linkage.md)（咬合与修复）、[`docs/phase7-go-live.md`](../phase7-go-live.md)（测试与上线）、[`docs/ai-gateway.md`](../ai-gateway.md)（网关与缓存）。

---

## 一、《任务 / 目标 / 线索 / 物品系统设计文档》

### 1.1 设计目标

在**不推翻**既有「DM JSON → 客户端 Zustand → 存档快照」主链路的前提下，补齐四层概念的**语义边界**与**可审计关联**：

| 概念 | 运行时权威载体 | 设计要点 |
|------|----------------|----------|
| **正式目标（Objective）** | `GameTaskV2`（`useGameStore.tasks`） | 与 `new_tasks` / `task_updates` 的 `id` 对齐；可选 `goalKind`、`requiredItemIds`、`sourceClueIds`、`promiseBinding`、`narrativeTrace`。 |
| **手记 / 线索（Clue）** | `ClueEntry[]`（`journal.clues` / `journalClues`） | 非正式任务；可绑定 `relatedObjectiveId`、升格候选 `maturesToObjectiveId`、物证弱引用 `relatedItemIds`、`trace`。 |
| **物品（Item）** | 注册表 `ITEMS` + 运行时 `inventory[]` / `warehouse[]` | 结构化回写以 **id** 为主；变更集对 `obtained_items` 有注册表与高阶未知 id 规则。 |
| **领域只读视图** | `DomainObjectiveView` 等（`narrativeDomain.ts`） | **不重复落库**；由 `objectiveAdapters.taskToDomainObjective` 从 `GameTaskV2` 投影，用于提示与产品语言统一。 |

### 1.2 保留的原架构

- **任务模型仍以 `GameTaskV2` 为唯一持久化任务形态**（含 Phase-3 立体化字段），未引入第二套任务表。
- **DM 回合结构仍以 legacy 字段为准**：`narrative`、`new_tasks`、`task_updates`、`clue_updates`、`awarded_items`、`awarded_warehouse_items`、`consumed_items` 等；客户端 `resolveDmTurn` 与 `play/page.tsx` 的 commit 逻辑仍围绕这些字段。
- **物品展示与校验仍以注册表 + 行囊对象**为主路径；未改为纯 ECS 或独立物品状态机。

### 1.3 兼容式扩展（本次改造）

- **`dm_change_set`（Zod `dmChangeSetSchemaV1`）**：模型输出「事件候选」，由 `applyDmChangeSetToDmRecord` **折叠**进上述 legacy 字段，并写入 `security_meta.change_set_trace` 便于审计。
- **手记进入存档**：`RunSnapshotV2.journal`（版本号 `JOURNAL_STATE_VERSION`），与 UI 层 `journalClues` 同步；合并策略为 `mergeCluesWithDedupe`。
- **叙事谱系 `NarrativeTraceV1`**：可选附着在线索与任务上，用于修复与调试（`system_repair` 等）。
- **读档完整性**：`repairNarrativeCrossRefs`（`narrativeIntegrity.ts`）在 `loadGame` / `hydrateFromCloud` 后修剪非法引用。

### 1.4 已完成 vs 预留

| 能力 | 状态 | 说明 |
|------|------|------|
| 变更集 → 线索 / 目标 / 发奖折叠 | **已完成** | `applyChangeSet.ts` + 上限与 trace |
| 目标「叙事可见」弱校验 | **已完成** | `isObjectivePlayerPerceived` |
| 未露出目标降级为手记 | **已完成** | 生成「未露出目标候选」类线索 |
| 承诺类 `goalKind: promise` | **已完成** | 来自 `npc_promises` / `goal_kind` |
| 物证门槛 `requiredItemIds` | **已完成** | 任务字段 + 读档修剪 + 任务板展示 |
| 手记升格指针 `maturesToObjectiveId` | **已完成** | 写入 + 终态任务时修复清除 |
| `promiseBinding` 强绑定叙事 | **部分** | 类型与 stable prompt 约束已有；**未**做独立服务端「玩家原句」指纹校验 |
| 关键物**自动**生成手记 | **未做** | 依赖 DM `clue_updates` 带 `relatedItemIds` 或叙事侧显式线索 |
| 世界状态机驱动「地点/对话解锁」 | **未做** | `dm_change_set` 含 `scene_changes` 等提示位，**未**接统一世界 FSM |

---

## 二、《数据结构与状态流说明》

### 2.1 核心类型与文件锚点

- **手记**：`ClueEntry`、`JournalState` — `src/lib/domain/narrativeDomain.ts`  
- **手记合并 / 规范化**：`normalizeClueDraft`、`mergeCluesWithDedupe` — `src/lib/domain/clueMerge.ts`  
- **任务**：`GameTaskV2` — `src/lib/tasks/taskV2.ts`（`normalizeGameTaskDraft`、`normalizeTaskUpdateDraft`、`normalizeDmTaskPayload`）  
- **目标领域视图**：`taskToDomainObjective`、`inferObjectiveKind` — `src/lib/domain/objectiveAdapters.ts`  
- **变更集**：`DmChangeSetV1` — `src/lib/dmChangeSet/schema.ts`；应用逻辑 — `src/lib/dmChangeSet/applyChangeSet.ts`  
- **客户端结构化上下文**：`ClientStructuredContextV1` — `src/lib/security/chatValidation.ts`（含可选 `narrativeLinkageDigest`）  
- **完整性修复报告**：`NarrativeIntegrityReport` — `src/lib/domain/narrativeIntegrity.ts`

### 2.2 状态流（单回合，简化）

```
模型输出 DM JSON（可能含 dm_change_set）
    → normalizePlayerDmJson 等（route 内）
    → applyDmChangeSetToDmRecord（折叠并删除 dm_change_set）
    → resolveDmTurn / settlementGuard 等既有链
    → 响应带 security_meta（含 change_set_applied / change_set_trace）
    → /play tryParseDM + commit
         → mergeJournalClueUpdates(clue_updates 规范化结果)
         → addItems / addWarehouseItems / task 合并逻辑（既有）
    → saveGame + resume shadow（手记以槽位存档为准；shadow 手记未全量镜像，见 phase7 风险）
```

### 2.3 存档边界

- **权威**：`RunSnapshotV2` 内 `tasks` 与 `journal.clues`（经 `projectSnapshotToLegacy` 与 store 对齐）。  
- **读档后**：`applyNarrativeIntegrityOnBundle` → 更新 `journal.clues` 与投影任务列表，避免失效指针。

---

## 三、《AI 输出契约与规则引擎说明》

### 3.1 契约分层

1. **Stable 规则（缓存友好）**  
   - 文件：`src/lib/playRealtime/playerChatSystemPrompt.ts`  
   - 内容：JSON 必填键、`dm_change_set` 字段说明、阶段 6「系统咬合」规则（承诺目标、物证、手记升格等）。  
   - **变更后**需按注释 bump `VERSECRAFT_DM_STABLE_PROMPT_VERSION`（见 `docs/ai-gateway.md`）。

2. **动态上下文**  
   - `getPromptContext` / 运行时 packet：`useGameStore.ts` 内拼接；阶段 6 增加 `buildNarrativeLinkagePromptBlock`（`narrativeLinkagePrompt.ts`）。  
   - 物品玩法：`buildItemGameplayPromptBlock`（`itemGameplay.ts`）；选项注入：`applyItemGameplayOptionInjection`。

3. **结构化客户端状态**  
   - `getStructuredClientStateForServer` 提供 `inventoryItemIds`、`warehouseItemIds` 等；可选 `narrativeLinkageDigest`（短摘要，**非权威**）。

### 3.2 规则引擎（服务端 / 变更集）

| 规则 | 实现位置 | 行为摘要 |
|------|-----------|----------|
| 变更集 Schema | `dmChangeSetSchemaV1` | 不通过则 `change_set_applied: false` + `schema_reject` trace |
| 目标升格上限 | `applyChangeSet.ts` 常量 | `MAX_NEW_TASKS_FROM_CHANGESET` 等 |
| 目标可见性 | `isObjectivePlayerPerceived` | 未通过 → 降级手记 + `objective_skip_unseen` |
| 候选 id 去重 | `collectCandidates` | `objective_candidates` / `commissions` / `npc_promises` 合并 Map |
| 发奖闸门 | `allowObtainedItem` | 注册表 / 高阶未知 id / 重复关键物 |
| legacy new_tasks 截断 | `applyChangeSet.ts` | 与变更集并存时的 cap |
| 叙事获得一致性提示 | `shouldWarnAcquireMismatch` 等 | `play/page.tsx` 侧 `console.warn` |

### 3.3 已完成 vs 预留

- **已完成**：变更集折叠、trace、与 legacy 字段对齐、stable prompt 中的契约描述。  
- **预留**：更细的「承诺必须匹配用户原句」的**结构化锚点**（如独立字段回传哈希）；世界风险 `time_pressure` 与任务 `expiresAt` 的**自动同步引擎**（当前多为提示与任务字段并存，未统一推导）。

---

## 四、《前端承载与 UI 最小改动说明》

### 4.1 Store（`useGameStore.ts`）

- **保留**：`tasks`、`inventory`、`warehouse`、`mergeCodex`、回合记忆等原 API。  
- **扩展**：`journalClues` + `mergeJournalClueUpdates`；读档/云同步后 `applyNarrativeIntegrityOnBundle`；`getPromptContext` / `getStructuredClientStateForServer` 增加叙事咬合摘要。

### 4.2 页面（`src/app/play/page.tsx`）

- **保留**：`tryParseDM` 后对白、选项、发奖、`codex`、`task` 更新主流程。  
- **扩展**：`clue_updates` → `normalizeClueUpdateArray` → `mergeJournalClueUpdates`；阶段 7 在 `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1` 时写入 `narrativeSystemsDebugRing` 并挂载 `NarrativeSystemsDebugPanel`。

### 4.3 组件级改动（最小）

- **`PlayNarrativeTaskBoard.tsx`**：增加「推进物证门槛」行（`requiredItemIds`）。  
- **`NarrativeSystemsDebugPanel.tsx`**：仅调试 env 下显示，**不改变**正式 UI 风格默认值。  
- 任务总览仍主要通过 **`PlayTaskPanel` / `PlayNarrativeTaskBoard`** 与既有排版共存。

### 4.4 已完成 vs 预留

- **已完成**：手记合并、任务板物证门槛、开发浮层。  
- **预留**：手记独立富交互（拖拽关联目标）、全局「目标优先级」视图、管理员面板与 play 共用数据源（见第六节）。

---

## 五、《测试与迁移说明》

### 5.1 测试资产（代码锚点）

- **变更集 / 目标**：`src/lib/dmChangeSet/applyChangeSet.test.ts`  
- **手记**：`src/lib/domain/clueMerge.test.ts`  
- **完整性**：`src/lib/domain/narrativeIntegrity.test.ts`  
- **集成链**：`src/lib/play/narrativeSystems.integration.test.ts`  
- **物品玩法**：`src/lib/play/itemGameplay.test.ts`  
- **回合解析**：`src/features/play/turnCommit/resolveDmTurn.test.ts`  
- **结算守卫**：`src/lib/playRealtime/settlementGuard.test.ts`  
- **调试环**：`src/lib/debug/narrativeSystemsDebugRing.test.ts`  
- **上线清单与命令**：`docs/phase7-go-live.md`

### 5.2 迁移与兼容

- 旧档无 `journal`：归一化为空手记；无 `goalKind` / `requiredItemIds`：按 `undefined` 处理。  
- 在线修复入口：`repairNarrativeCrossRefs`（读档/云拉取后）。  
- 回滚：代码 revert 后旧档仍可读；关闭 `NEXT_PUBLIC_*DEBUG` 与可选服务端 `VERSECRAFT_DM_CHANGESET_DEBUG`。

### 5.3 已知限制（交接必读）

- 同回合 **`dm_change_set` 生成的 `clue_updates` 与模型直连 `clue_updates` 的合并策略**：以 `applyChangeSet` 实现为准，存在**覆盖**风险（见 `phase7-go-live.md`）。

---

## 六、《后续扩展建议》

以下均基于**当前扩展点**与文件位置，便于排期与拆分 PR。

### 6.1 玩家主动立目标

- **数据**：新增 `playerDeclaredObjectives[]` 或给 `GameTaskV2` 增加 `origin: "player" | "dm"` + `playerNote`；与 `new_tasks` 合并时防 id 冲突（前缀 `player_`）。  
- **入口**：`play/page.tsx` 手动输入栏或任务板「记下目标」按钮 → 调 store `addTask` / 新手记 `source: "player_inferred"`。  
- **AI**：stable prompt 增加「尊重玩家自拟目标」；`dm_change_set` 可扩展 `player_objective_ack` 由模型确认。  
- **现状**：`NarrativeEntitySource` 已含 `"player_inferred"`，**手记侧预留语义**；**无**独立玩家目标状态机。

### 6.2 目标优先级与时间压力

- **数据**：`GameTaskV2` 已有 `expiresAt`、`deadlineHint`、`urgencyReason`；变更集有 `time_pressure` 写入 `security_meta.change_set_hints`。可增设 `priorityRank: number` 或 `sortKey`。  
- **规则引擎**：在 `partitionTasksForBoard`（`taskBoardUi.ts`）或 store selector 中按 `priorityRank` + `time_pressure` 排序。  
- **AI**：`dm_change_set` 扩展 `objective_candidates[].deadline_game_hour`（需 Zod 与折叠逻辑）。  
- **现状**：**提示与展示字段部分存在**；**未**统一从 `time_pressure` 驱动任务过期或自动 `failed`。

### 6.3 物品组合 / 拆分

- **数据**：注册表或新表 `itemRecipes[]`（合成）；或 `Item` 上 `components: string[]` / `splitInto: string[]`。  
- **结算**：在 `serviceExecution.ts` / 专用 API 或 DM `item_state_changes` 中增加 `combine` / `split` action（需扩展 `schema.ts` 与 `applyChangeSet.ts`）。  
- **现状**：`item_state_changes` 仅有 `consume|lose|mark_used|transfer_to_warehouse`；**无**组合/拆分。

### 6.4 证据对峙玩法

- **玩法层**：`itemGameplay.ts` 已区分 `evidence` 与 `buildItemUseStructuredIntent`；选项注入已有「【证】」类前缀。  
- **扩展**：引入「对峙回合」状态（store：`confrontation: { npcId, evidenceIds[], stance }`），由 DM JSON 新键或 `task_updates` 扩展字段驱动 UI 高亮与选项集。  
- **规则**：`settlementGuard` 对「出示证据」类消耗单独白名单。  
- **现状**：**叙事 + 选项锚定已有**；**无**独立对峙状态机与专用 JSON 契约。

### 6.5 NPC 对关键物的特殊反应

- **数据**：`src/lib/registry` 扩展 NPC 条目或 `npcItemReactions: Record<npcId, Record<itemId, ReactionRule>>`。  
- **注入**：在 `getPromptContext` 或 npc packet 构建处，根据 `inventoryItemIds ∩ rules` 追加短摘要（类似 `buildNarrativeLinkagePromptBlock`）。  
- **结构化回写**：`relationship_updates` + `clue_updates` 已由 prompt 约束；可再加 `npc_item_reaction_fired: []` 用于 analytics。  
- **现状**：**通用关系与 clue 回写已通**；**无**按 npc×item 的配置表。

### 6.6 更强的世界状态联动

- **数据**：统一 `worldFlags` 与 `scene_changes` 的归并层（例如 `applyWorldDelta.ts`），由 `task.status` 与 `clue.status` 触发 `worldFlags.add/remove`。  
- **存档**：`RunSnapshotV2` 已能带 world 相关字段的投影；需在 **单入口**（如 `postTurnStoryDirectorUpdate`）收敛副作用。  
- **现状**：`worldFlags`、导演层、逃脱主线等**多条链路并存**；**未**建立与「目标终态」绑定的单一世界 FSM。

### 6.7 管理员调试面板

- **短期**：扩展 `NarrativeSystemsDebugPanel`：只读展示 `getNarrativeSystemsDebugTail` + 从最近一次 `parsed.security_meta` 拉取的完整 trace（需 page 将末帧存入 ref 或轻量 store）。  
- **中期**：独立路由 `/admin/narrative-debug`（鉴权），服务端转发只读 `checkNarrativeCrossRefs` 结果（需 API + 存档拉取）。  
- **长期**：与 telemetry 打通，关联 `requestId`。  
- **现状**：**仅客户端环形缓冲 + 浮层**；**无**服务端聚合后台与权限模型。

---

## 七、维护清单（给负责人）

1. 改 DM 契约：同步 **`playerChatSystemPrompt.ts`** + **`dmChangeSet/schema.ts`** + **`applyChangeSet.ts`** + **相关测试**。  
2. 改任务字段：同步 **`taskV2.ts`** 规范化函数 + **存档投影** + **integrity 修剪规则**。  
3. 改手记字段：同步 **`narrativeDomain.ts`** + **`clueMerge.ts`** + **`normalizeRunSnapshotV2`**（若有）。  
4. 发版前：跑 `docs/phase7-go-live.md` 中的测试命令；生产关闭 `NEXT_PUBLIC_*DEBUG`。

---

*文档版本：与仓库实现同步维护；若实现变更，请更新本节锚点与「已完成/预留」表格。*
