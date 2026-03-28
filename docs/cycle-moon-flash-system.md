# 十日闭环：月亮、闪烁、锚点与运行时

本文档描述 **单一解释面** 下的时间/循环逻辑，并与工程层 **registry + packet + RAG** 对齐。叙事细则仍可分层揭露，但底层不应再被写成多套互不相干的设定。

## 1. 因果链总览（强闭环）

1. **确定起点**：耶里学校侧【空间】碎片大规模异动与「卷入」叙事（`rootCanon` / `SCHOOL_INCIDENT_ORIGIN_ID`）。  
2. **公寓果**：如月公寓为沿旧裂隙生长的 **七锚收容泡层**；主锚＝玩家回声体，六辅锚＝固定共鸣位。  
3. **封闭窗口**：约 **10 日量级** 的纠错窗口内，系统按 **校准 → 前兆 → 执行型闪烁 → 失败回收** 运行。  
4. **非重复演戏**：每一轮不是同一剧本重演；不可收敛分支被 **校准回收**，允许保留受控 **失败痕迹**（见 §6）。  
5. **龙月**：月亮＝龙之外置魔力调度面，向泡层提供 **校准能量与节律**；游戏内 **第 3 日起** 的暗月阶段是其可观测后果之一（与既有昼夜框架兼容：仍由客户端/服务端推进「第 X 日 Y 时」，本层只做语义对齐）。  
6. **闪烁**：具备 **前兆 / 过程 / 结果** 三段（registry：`FLASH_PIPELINE`），不是纯特效。  
7. **复活/锚点重构**：另一条 **回写路径**，与窗口末闪烁 **共享语义**（拓扑回写、时间推进、代价释放、局势改写），**触发条件不同**，均非免费回档。

权威结构化定义见：`src/lib/registry/cycleMoonFlashRegistry.ts`。  
运行时 JSON：`cycle_time_packet`（`schema: cycle_time_v1`），由 `buildRuntimeContextPackets` 注入。

## 2. 十日流程（位相）

日历日可连续增长（11、12…），**位相**按 **模 10** 回折到窗口内位置 `positionInDecade`（1–10），与「游戏时间[第 X 日]」兼容。

| 位相键 (`cyclePhase`) | 大致位相日 | 含义 |
|----------------------|------------|------|
| `quiescence` | 1–2 | 基线调度，龙月语义偏 `baseline_scheduling` |
| `calibration` | 3–6 | 龙月驱动校准；威胁抬升、带宽收紧可并置 |
| `precursor` | 7–8 | 闪烁 **前兆** 主舞台 |
| `correction_window` | 9–10 | 执行纠错与回收 |

`moonSemanticKey` 在 registry 中进一步区分 `dragon_moon_calibration` / `bandwidth_tighten` / `correction_coupled_flash`，与 UI 月亮展示可绑定，但语义上仍是 **同一能量—节律源** 的不同阶段。

## 3. 闪烁：前兆、过程、结果

- **前兆**（位相 7–8，`flashProximity: precursor_band`）：四轴并行抬升（见 §4）。  
- **过程**（位相 9+）：泡层执行 **裁剪/重绑**，非仅画面闪烁。  
- **结果**：失败轮次被回收，主拓扑回写至最近稳定锚；可与 **锚点重构** 的局势改写叠加，但非同一条指令。

## 4. 前兆四轴（玩家感知层）

`cycle_time_packet` 在 fracture+ 且处于前兆或迫近窗口时注入 `precursorChannels`：

| 轴 | 指向 |
|----|------|
| **环境** | 光色、底噪、配电/排污节律同步偏移；B1 迟滞带相对更稳，反差放大。 |
| **角色** | 高共鸣个体短暂失语、重复动作、情绪闪回；欣蓝轴易出现「未发生之事的情绪余震」。 |
| **楼层** | 景深/门牌错位感；威胁数值未变时仍可给「走错片场」式体感。 |
| **叙事** | 任务文案、留言、广播措辞漂移；同一事件短暂出现不兼容版本。 |

## 5. 复活与代价（与 B1 / 原石）

锚点重构四元组（registry：`ANCHOR_REBUILD_SEMANTICS`）：

- **拓扑重写**：回写最近稳定回声体—锚点拓扑。  
- **时间推进**：类 12h 推进叙事，禁止零秒读档。  
- **代价释放**：掉落、损耗、关系/任务压强折算。  
- **局势改写**：秩序节点对僵局再定价（与 `revive_anchor_lore_packet`、`WORLD_ORDER_CANON` 一致）。

**B1**：迟滞稳定带＝ **可运维前端**（交易、锻造、修整、锚点安全窗），与地上节律压迫 **硬对比**，不是「作者说安全就安全」的剧情豁免，而是结构位置（`b1_stability_band`）。

**原石**：仍为泡层壁析与秩序再分配产物；在高压窗口下作为 **延缓同化 / 交易 / 修复** 的硬通货，与校准代价叙事相容（`originium` 条目）。

`playerContext` 可携带 **`本轮锚点重构[1]`** 或世界标记 `cycle.anchor_rebuild` / `cycle.anchor_rebuilt_this_cycle`，解析为 `PlayerWorldSignals.anchorRebuiltThisCycle`，进入 `cycle_time_packet.anchorRebuiltThisCycle`。

## 6. 失败轮次留下什么（痕迹类型）

工程 id 列表：`FAILURE_CYCLE_TRACE_KINDS`（packet 内 `failureTraceLabels` 附中文释义）：

- `residual_echo`：残响  
- `score_mark`：刻痕  
- `stale_note`：旧笔记  
- `misplaced_item`：错位物品  
- `relation_mismatch`：错位关系反应  

清理语义：`FAILURE_CYCLE_CLEANUP_SEMANTICS` — 剪枝不可收敛枝、允许受控残留、与锚点回写可对账。

## 7. 七人时间体验差分

| 角色 | 模式 | 说明 |
|------|------|------|
| 主角 | `memory_fragment_echo` | 记忆残片型：边界、锚点步态、关键抉择可跨轮残留。 |
| 欣蓝 N-010 | `emotion_fragment` | 情感残片型；`npcTimeMemoryNearby` 在 deep+ 给出。 |
| 其余辅锚 | `deja_conditional` | 既视感 / 条件触发型；细节见 `majorNpcDeepCanon.memoryRetentionMode`。 |

## 8. 运行时与揭露档位

- **`cycle_time_packet`**  
  - `surface`：`calendarDay`、`rhythmTightens`（第 3 日起）。  
  - `fracture`：+ `positionInDecade`、`cyclePhase`、`flashProximity`、`precursorPhaseActive`、`nearFlashPressure`、`anchorRebuiltThisCycle`、`protagonistTimeExperience`、条件性 `precursorChannels`。  
  - `mechanism`（deep+）：+ `moonSemanticKey`、`flashPipeline`、`anchorRebuildSemantics`、`failureCleanupSemantics`、`failureTraceKinds`、`npcTimeMemoryNearby` 等。

- **`cycle_loop_packet`**（deep 机制带）含 `companionStructuredPacket: "cycle_time_packet"`，提示模型与工具 **优先读结构化时间包**。

- **`revive_anchor_lore_packet`**（deep）含 `structuredCrossRef: "cycle_time_packet"` 与 `anchorRebuiltThisCycle`。

## 9. 为什么不像「作者想怎样就怎样」

- **单一因果链**：学校泄露 → 泡层收容 → 龙月供能 → 十日位相 → 闪烁执行回收；月亮/B1/复活/暗月均为链上节点，而非独立补丁。  
- **硬边界写进 registry**：位相阈值、痕迹类型、重构四元组、清理策略均有 **稳定 id**，供任务与检索引用。  
- **与状态回写对齐**：循环描述 **服从服务端** 已发生的 `游戏时间`、`世界标记`、复活摘要；packet 只 **解释与裁剪**，不改存档逻辑。  
- **分层揭露**：surface/fracture 仍隐藏机制全貌，由 `maxRevealRank` 控制，避免开局倾泻。

## 10. 检索与 bootstrap

- **Core canon**：`buildCycleMoonFlashFactsForCanon()` 写入 `coreCanonMapping`（`factKey` 前缀 `cycle_moon:`）。  
- **registryAdapters**：同步生成 `truth:cycle_moon:*` 实体块，便于向量检索。

## 11. 相关文件索引

| 用途 | 路径 |
|------|------|
| 结构化 registry | `src/lib/registry/cycleMoonFlashRegistry.ts` |
| 信号解析 | `src/lib/registry/playerWorldSignals.ts` |
| 学制切片（叙事短句） | `src/lib/registry/schoolCycleCanon.ts` |
| 根真相 / 稳定锚 | `src/lib/registry/rootCanon.ts` |
| 系统因果条目 | `src/lib/registry/worldOrderRegistry.ts` |
| 世界弧 bootstrap | `src/lib/registry/worldArcBootstrapSlices.ts` |
| Runtime 组装 | `src/lib/playRealtime/runtimeContextPackets.ts` |
| 复活 lore 包 | `src/lib/playRealtime/worldLorePacketBuilders.ts` |

---

*若仅改叙事长文而不更新 `cycleMoonFlashRegistry` 与 `cycle_time_packet`，视为与 canon 脱节；若只改 registry 而不跑通 packet/RAG，视为未完成闭环。*
