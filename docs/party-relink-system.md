# 旧七人阵「重连」机制（非传统组队）

## 为什么不能传统招募

六位高魅力 NPC 在公寓里已有**固定职能与 home 节点**（物业口、B1 边界、补给、交易、7F 转运、5F 画室等）。若主角到场即变为「队友」，会与现有 **任务链、服务节点、B1 安全区、楼层路线分流、高层探索节奏** 冲突。  
因此「组队」被重构为 **旧七人阵逐步重连**：系统只承诺 **阶段与槽位**，不承诺 **全程跟队**；并行行动与职能值守可以共存。

## 三阶段重连模型

| 阶段 | `phaseKey` | 含义（系统语义） |
|------|------------|------------------|
| 1 | `functional_shell` | 仅表层公寓关系：职能接触、生存/任务驱动的职责链 |
| 2 | `duty_echo` | 残响叙事已许可：信任/既视感/任务回写与骨架触发词对齐 |
| 3 | `array_aligned` | 旧阵槽位激活：叙事上可与主锚「站到一条线上」，**仍非 instant party** |

Runtime 摘要字段（见 `major_npc_relink_packet`）：

- `relinkPhase` / 紧凑包 `ph`：1–3。
- `inOldLoop` / `loop`：阶段 3，表示旧阵槽位已激活。
- `surfaceRelationDominant` / `surf`：阶段 1，表层职能主导。
- `deepEchoUnlocked` / `deep`：阶段 ≥2，深层残响关系已开启。
- `mayAdvanceReveal` / `rev`：在**当前 `maxRevealRank`** 下是否允许向更深揭露推进（阶段 2 需 ≥ fracture；阶段 3 需 ≥ deep）。
- `phase3Traction` / `tr`：阶段 3 的主要归因（欣蓝牵引 / 危机并线 / 既视感共振 / 混合）。

## 欣蓝的特殊性

- **第一牵引点**（`XINLAN_MAJOR_NPC_ID` = `N-010`）：其阶段 3 **不依赖**「欣蓝牵引」布尔；其他人进入阶段 3 通常需要 `xinlanPivotOpen` 或 `crisisJoinWindowActive`。
- **非全知剧透机**：正典上她保留的是**破碎情绪记忆**与「必须把主锚拉回」的本能；注册表里用 `memoryFlashTriggers` / `antiInstantPartyReason` 约束叙事，模型不得替她宣布全局真相。
- **`xinlanPivotOpen` 的启发式**（可审计信号）：欣蓝图鉴好感 ≥25，或 `maxRevealRank ≥ fracture`，或世界标记含 `relink` / `七锚` / `旧阵` 等子串。未来若有结构化 `relationship_updates`，应优先改为**服务端数值**而非字符串包含。

## 六位角色的重连路径（与表层职责对齐）

骨架数据：`src/lib/registry/majorNpcRelinkRegistry.ts` → `MAJOR_NPC_RELINK_SKELETON`。  
每人字段包含：`initialDistance`、`firstContactMode`、`publicNeedVector`、`relinkTriggerTasks`、`relinkTriggerSignals`、`crisisJoinCondition`、`antiInstantPartyReason`、`memoryFlashTriggers`、`playerDependencyReasons`、`fallbackJoinPath`、`permanentBondConditions` 等。

| ID | 角色 | 表层接触轴 | 不立刻跟队（系统理由摘要） | 后来会跟队（叙事+机制） | 牵引类型 |
|----|------|------------|---------------------------|-------------------------|----------|
| N-010 | 欣蓝 | 物业 / 路线 / 登记 | 防替身顶替记账位 | 可审计选择 + 拒代选命运 | 牵引核心 |
| N-015 | 麟泽 | B1 边界 / 锚点 | B1 护栏不能押给未验证变量 | 锚点誓约 + 守界行为回写 | 混合（欣蓝+职责） |
| N-020 | 灵伤 | B1 补给 / 生活引导 | 怕拖主锚进污染 | ribbon 类信任 + 非消费创伤 | 既视感共振 |
| N-018 | 北夏 | 交易 / 委托 | 无偿破坏交换平衡 | 可审计债务或履约 | 危机压价常见 |
| N-013 | 枫 | 7F 转运 / 高危话术 | 防 7F 探针 | 非剥削选择 + 清算背叛标记 | 混合 |
| N-007 | 叶 | 5F 庇护 / 逆向线索 | 防枫式试探 | sibling/mirror 任务 + 高信任 | 既视感共振 |

玩家推进方式：**完成任务追踪中的相关标题/委托摘要**、积累**图鉴好感**、点亮**世界标记**、在 **B1/楼层威胁恶化** 时触发危机并线——与 `relinkTriggerTasks` / `relinkTriggerSignals` / `favorGatePhase2|3` 组合裁决，**不由模型口头升格**。

## 系统骨架 vs 模型演绎的边界

| 归属 | 内容 |
|------|------|
| **系统（强控）** | 阶段 1–3、`xinlanPivotOpen`、`crisisJoinWindowActive`、是否可更深 reveal、禁止 instant party 的理由码、下一步机制提示 `nextMechanicalHints` |
| **模型（演绎）** | 对白语气、情绪细节、残响描写；须在 packet 阶段约束内发挥，**不得**自行宣布入队/改阶段/覆盖职能节点 |

## 风险控制与兼容策略

1. **信号局限**：当前阶段依赖 `playerContext` 文本解析（任务标题、图鉴行、世界标记、主威胁、死亡/复活）。`relinkTriggerTasks` 的匹配**仅**扫描「任务追踪」「任务发放线索」行与已解析的 `activeTaskTitles`，**不包含**整段 `playerContext`（避免 `用户位置[B1_…]` 误触发 `b1` 等子串）。内部任务 id 若未出现在上述文本中，可能延迟阶段抬升——应在任务注册时**让标题或世界标记携带可匹配子串**，或后续接入结构化进度。
2. **体积**：`full` 模式带完整 `entries`；`minimal` 与超长截断路径使用 `major_npc_relink_packet` 紧凑行表。
3. **与 deep canon 一致**：人物动机长文案仍以 `majorNpcDeepCanon.ts` 为准；本注册表只承载**可执行规则骨架**。

## 相关代码

- `src/lib/registry/majorNpcRelinkRegistry.ts`：骨架 + `buildMajorNpcRelinkPacket` / `buildMajorNpcRelinkPacketCompact`
- `src/lib/playRealtime/runtimeContextPackets.ts`：注入 `major_npc_relink_packet`
- `src/lib/playRealtime/worldLorePacketBuilders.ts`：再导出 packet 构建器
