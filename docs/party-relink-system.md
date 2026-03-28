# 旧七人阵重连系统（Party Relink）

## 目标

把「组队」从 **招募闲置队友** 改为 **在欣蓝牵引下逐步重连已破碎的共同命运网络**。六人始终在公寓内承担生存职责，**不**应开场无脑进队。

## 架构分层

| 层 | 职责 | 文件 |
|----|------|------|
| **骨架注册表** | 每人静态字段：门槛、触发词、牵引类型、自然接触链、深层条件摘要 | `src/lib/registry/partyRelinkRegistry.ts` |
| **阶段裁决** | 根据图鉴好感、任务追踪文本、世界标记、邻近 NPC、揭露档、危机窗口计算阶段 1→3 | `src/lib/registry/majorNpcRelinkRegistry.ts` |
| **Packet 输出** | `major_npc_relink_packet`（完整）/ 缩写行 `rows`；`major_npc_arc_packet` 中的 `relinkSignals` | `runtimeContextPackets.ts`、`worldSchoolRuntimePackets.ts` |
| **团队态势纹理** | `team_relink_packet`（邻近简化） | `worldSchoolRuntimePackets.ts` |

模型只负责 **语气与场景描写**；**阶段数字、是否允许核心并队、是否开放团队向任务许可** 必须由 packet 为准。

## 三阶段模型（每人）

1. **阶段 1 — 表层职能接触**：只承认公寓岗位与 publicNeedVector，不允许旧阵密谈当事实。
2. **阶段 2 — 旧残响触发**：`deepEchoUnlocked`；fracture+ 可给职责回声（`fractureHintStyle`）；可许可 **情感记忆回潮**（`emotionalMemoryFlashLicensed`，仍受 stable 约束）。
3. **阶段 3 — 危机或任务促成旧阵重连**：`inOldLoop` / `canEnterCoreParty`；**仍非**全程 RPG 跟宠，职能节点保留。

## 欣蓝牵引与替代

- `xinlanPivotOpen`：欣蓝好感 ≥25 **或** 揭露 ≥ fracture **或** 世界标记含七锚/旧阵等。
- 其余五人默认 `requiresXinlanPivotForPhase3: true`：阶段 3 需 **牵引打开** 或 **危机窗口**（死亡、复活线、主威胁 breached 等）。
- 欣蓝本人不受「需牵引」限制（她即第一牵引）。

## 系统可读摘要（`MajorNpcRelinkEntry`）

| 字段 | 含义 |
|------|------|
| `relinkPhase` | 1 / 2 / 3 |
| `relinkStageLabel` | 当前阶段对应 `relinkStageLabels` 文案 |
| `inOldLoop` / `canEnterCoreParty` | 阶段 3：旧阵槽位激活 |
| `fractureRelationshipLineOpen` | fracture+ 且已进入阶段 ≥2 |
| `deepRelationshipLineOpen` | deep+ 且阶段 3 |
| `mayAdvanceReveal` | 系统允许在叙事上向更深揭露靠拢（仍受任务与世界标记约束） |
| `mayTriggerTeamScopedTasks` | 阶段 ≥2 且（牵引开 **或** 危机 **或** 欣蓝本人）— **任务系统须二次校验** |
| `emotionalMemoryFlashLicensed` | 阶段 ≥2 且 fracture+，允许记忆回潮类描写 |
| `deepRevealUnlocksActive` | 按 `maxRevealRank` 裁剪后的 `deepRevealUnlocks` |
| `tractionAttribution` | 阶段 3 主归因：`xinlan_pull` / `crisis_pressure` / `deja_resonance` / `mixed` |
| `closedLoopWeight` | 1–6，团队聚合任务优先级提示 |
| `fractureHintStyle` | 叙事提示风格：`ledger_soft` / `boundary_dry` / `warm_buffer` / `price_casual` / `script_bait` / `mirror_cold` |

## 缩写 packet（`major_npc_relink_packet` minimal）

`rows[]` 字段：`ph` 阶段，`loop` 旧闭环，`party`=`canEnterCoreParty`，`team`=`mayTriggerTeamScopedTasks`，`mf`=`emotionalMemoryFlashLicensed`，`w`=`closedLoopWeight`。

## 自然接触链（设计对照）

- **欣蓝**：登记 / 路线 / 异常熟悉（非全知）
- **麟泽**：B1 边界、锚点、守线
- **灵伤**：补给、生活引导、创伤壳
- **北夏**：交易、碎片、探索驱动（对价）
- **枫**：高危线、执行、风险推进
- **叶**：庇护、逆向线索、镜像反制

完整文案与「为何不立刻跟队 / 为何最终会跟队 / 玩家须做什么」见 **`PARTY_RELINK_REGISTRY`** 各条目：`whyNotImmediateParty`、`whyEventuallyJoins`、`playerMustDoDeepLoop`。

## 与现有系统的兼容

- **任务**：继续用 `relinkTriggerTasks` 关键词匹配 `任务追踪` / `任务发放线索` 文本（非整段 playerContext，避免误匹配位置标签）。
- **B1 服务**：不改变 service id；阶段 1 仍以职能为主。
- **上楼探索**：`publicNeedVector` / 欣蓝登记链与现有 route 任务一致。
- **复活 / 死亡**：`computeCrisisJoinWindowActive` 纳入死亡累计、复活线、主威胁 breached。
- **关系更新**：图鉴好感行解析不变（`parseCodexFavorByNpcId`）。

## 测试

- `src/lib/registry/majorNpcRelinkRegistry.test.ts`：阶段与危机替代牵引。
- `src/lib/registry/worldSchoolCycleAcceptance.test.ts`：`MAJOR_NPC_RELINK_SKELETON` 键与 relink packet 注入。

---

**维护约定**：改门槛或叙事许可请先改 **`partyRelinkRegistry.ts`**，再确认 **`majorNpcRelinkRegistry`** 计算逻辑无需额外分支。
