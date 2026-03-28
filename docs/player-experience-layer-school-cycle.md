# 玩家体验层：学制循环下的「想再玩一轮」闭环

本文从**玩家体验**补最后一层：在设定自洽之外，提供**拉力、情绪抓手、可感知的旧轮痕迹**，并说明哪些已落地为 **registry / packet / RAG**，哪些仅 **数据预留** 给任务与事件生产。

---

## 1. 为什么这些补强是必要的

| 体验问题 | 若无结构化支撑易出现 | 体验层对策 |
|----------|----------------------|------------|
| 为何要活过下一轮 | 只剩「设定威慑」，缺少个人收益感 | 失败可留**证据**与**元增益钩子**；纠错=剪枝坏分支但保留**下一环抓手** |
| 为何要接近六人 | 像解密 NPC 而非活人 | **错位熟悉/身体记忆/亏欠感**（非好感继承）+ **可主动碰剧情**但不抢选项 |
| 如何感知旧轮 | 只有口头「循环」 | **五类痕迹** + **手记/错位记录/刻痕**叙事预算 + 可选 `xp.*` flag 点亮 |
| 失败=挫败 | 玩家不愿再试 | 明示**认知/路线/关系/线索**型携带（叙事向，非无脑加数值） |
| 只有谜语无情绪 | 出戏、疲劳 | **前兆模板**（环境+六人轴反应+普通人误读）+ **具体物证/反应**而非纯术语 |

---

## 2. 本轮已实现（可消费）

| 交付 | 路径 / 行为 |
|------|-------------|
| **结构化 registry** | `src/lib/registry/playerExperienceSchoolCycleRegistry.ts` |
| **Runtime packet** | `school_cycle_experience_packet`，`schema: school_cycle_experience_v1` |
| **注入** | `buildRuntimeContextPackets` → full + `worldLorePacketsCompact`（缩写 `xp` 包） |
| **世界观指针** | `worldview_packet.structuredSchoolCycleRefs` 含 `school_cycle_experience_packet`（fracture+） |
| **Stable 声明** | `playerChatSystemPrompt` 动态上下文一句点名该包 |
| **RAG / bootstrap** | `buildPlayerExperienceSchoolCycleFactsForCanon()` → `coreCanonMapping`；`registryAdapters` 生成 `truth:xp_layer_*` 实体 |
| **世界标记约定** | `playerContext` 世界标记中 `xp.*` / `cycle_residue.*` 会进入 `litByWorldFlags`（最多 8 条），供模型与后续任务对齐 |

### 2.1 Packet 分档（与 reveal 一致）

- **surface**：`pullLine` + 全量 `evidenceTraceKinds` / `residualChannels`（短标签+`suggestedTaskHook`）+ `litByWorldFlags`。
- **fracture+**：`residuePerception`（四种残留感知）、`carryoverMeta`（`packet_ready` 子集）、**前兆**（位相 7–8 或迫近时 `precursor`：`templateId`、`env`、`sixNearby`、`mundaneMisread`）、`npcInitiative`（邻近高魅力 **hookIds + dmOneLiner**，`initiativeBand`）。
- **deep+**：完整 `carryoverMeta`（含 `data_reserved`）、`antiSpoilerNote`。

### 2.2 与既有系统的关系

- **痕迹类型**与 `cycleMoonFlashRegistry` 的 `FAILURE_CYCLE_TRACE_KINDS` **对齐**；`RESIDUAL_EVIDENCE_CHANNELS` 为每条增加 **玩家向 id** 与 **叙事预算**。
- **前兆**与 `cycle_loop_packet` / `cycle_time_packet` 的位相同步；模板按 `precursor_band` / `imminent` 选用。
- **六人反应**按 `majorNpcDeepCanon.teamBridgeRole` 映射到模板中的轴心句，**仅邻近 NPC** 返回，控制体积。

---

## 3. 数据预留（未接 UI / 未强制玩法）

| 预留 | 说明 |
|------|------|
| `suggestedTaskHook` / `hookIds` | 字符串 id，**任务系统可逐步实现**；当前 packet 只列出供 DM/策划对齐 |
| `implementationStatus: data_reserved` 的 carryover | **认知标签固化**、**钉板线索**等需在任务与守卫中与 `main_threat` / 图鉴回写对齐后再启用 |
| `xp.*`、`cycle_residue.*` flag | 由**服务端/任务**写入 `playerContext` 世界标记后，`litByWorldFlags` 才有实例数据 |

---

## 4. 后续适合落地的内容形态

| 内容 | 建议载体 |
|------|----------|
| 残响手记 / 错位记录 / 刻痕 | **支线任务** + 可选 **仓库/图鉴条目**（仍可不做大 UI，先叙事+回写 flag） |
| 旧轮关系残留 | **对话节点** + `relationship_updates` 的**小额、有理由**波动，避免直继承好感 |
| 失败永久增益 | **任务奖励叙事** + `worldFlags`（如 `xp.carryover.route_shortcut_memory`） |
| 前兆模板 | **导演/事件**在 7–9 日触发环境描写；packet 提供**模板 id** 防跑偏 |
| 高魅力主动推剧情 | **任务 granting** 使用 `MAJOR_NPC_PROACTIVE_HOOKS.hookIds`；NPC 先**拦/递/报价**再由玩家选 |

---

## 5. 硬约束回顾

- **不大改 UI**：无新面板；证据以 narrative + flag + 未来任务文案呈现。
- **不强推复杂玩法**：增益为**叙事/认知/路线**向，不引入新战斗维度。
- **不抢主角选择权**：`npcInitiative` 明确为 **nudge/intercept/observe**，DM 一句指向**抉择点**而非代按。

---

## 6. 修改与依赖摘要

- 新增：`playerExperienceSchoolCycleRegistry.ts`、`playerExperienceSchoolCycleRegistry.test.ts`、`docs/player-experience-layer-school-cycle.md`。
- 修改：`runtimeContextPackets.ts`、`coreCanonMapping.ts`、`registryAdapters.ts`、`stage2Packets.ts`（`structuredSchoolCycleRefs`）、`playerChatSystemPrompt.ts`、`route.ts` 注释、`runtimeContextPackets.test.ts`、`worldSchoolCycleAcceptance.test.ts`。

---

## 7. 策划速查：世界标记示例（可选）

服务端可在世界标记中写入（与现有「世界标记：a，b」格式一致）：

- `xp.echo_handbook_seen`
- `xp.carryover.route_shortcut_memory`
- `cycle_residue.stale_note_3f`

将出现在 `school_cycle_experience_packet.litByWorldFlags`，便于模型与后续任务一致引用。

---

*设定正文仍优先 packet / retrieval；本层专门补「为什么还想玩」的可感细节与生产用 hook。*

相关文档：`docs/world-packets-school-cycle.md`、`docs/cycle-moon-flash-system.md`、`docs/prompt-integration-school-cycle.md`。
