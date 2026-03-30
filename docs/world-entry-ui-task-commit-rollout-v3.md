# VerseCraft 世界入口 · UI · 任务 · Commit 工程化上线说明（v3）

## 1. 本次修复范围

- **灰度开关**：`src/lib/rollout/versecraftRolloutFlags.ts` 集中定义 `VERSECRAFT_ENABLE_*` 系列环境变量，默认与当前主线路径一致（`true`），可逐项回滚。
- **运行时 packet**：空间权柄、月初误入、世界入口、`npc_social_surface` 等与 `buildRuntimeContextPackets` 联动；文风短块经 `buildStyleGuidePacketBlock` 注入动态 suffix。
- **任务板**：`filterTasksForTaskBoardVisibilityV2`（V2）在客户端由 `NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2` 镜像控制。
- **玩家可见文案**：`sanitizePlayerFacingText` / `replaceInternalNpcIdsForDisplay`（`src/lib/play/playerFacingText.ts`）。
- **观测指标**：`src/lib/observability/versecraftRolloutMetrics.ts`（进程内计数器，可对接 analytics）。
- **测试**：`phase9RolloutGoldenScenes.test.ts`、`versecraftRolloutFlags.test.ts`、`playerFacingText.test.ts`、扩展 `taskBoardUi.test.ts`。

## 2. 核心链路变化

| 环节 | 变化 |
|------|------|
| System prompt | 动态 suffix 可选追加【文风·质感】短块（`VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET`）。 |
| Runtime JSON | `space_authority_baseline_packet` 可关；`npc_social_surface_packet` 可关；新增 `player_world_entry_packet`（统一「空间权柄」入口语义）。 |
| NPC 心脏 | `peerRelationalCues` 随 `VERSECRAFT_ENABLE_NPC_SOCIAL_SURFACE` 关闭。 |
| 基线 | `VERSECRAFT_ENABLE_MONTHLY_STUDENT_ENTRY` 关闭时弱化「月初误闯」措辞。 |
| 任务板 | V2：`soft_lead` 且 `available` 不进入分区，避免未正式授予却像已挂任务。 |
| Chat 请求 | `recordPromptCharDelta` 记录动态 suffix 字符量（供 `promptCharDelta` 分析）。 |

## 3. 世界观闭环说明

- **校源与公寓碎片**：在叙事上统一为 **空间权柄** 下的表层切口；`player_world_entry_packet.unifiedShardLabel` 与 `space_authority_baseline_packet` 同源，避免两套「真相」叙事打架。
- **深层真相**：仍由 `reveal_tier` / `school_source` / `majorNpcDeepCanon` 门闸控制；本 rollout 不扩大泄底。

## 4. 玩家入口与 NPC 初始认知

- **普通 NPC**：默认「又一批误闯学生」；关闭 `VERSECRAFT_ENABLE_MONTHLY_STUDENT_ENTRY` 时改为不强调月初误入的通用学生口吻。
- **高魅力 / 夜读 / 欣蓝**：仍由 `npcCanon` + `npc_player_baseline_packet` + `npcHeart` 约束；开关关闭时只影响「月初」字面强度，不降级为普通 NPC 特权。

## 5. 开场与首轮 options 新机制

- **固定长文**：仍由 `FIXED_OPENING_NARRATIVE` 前端渲染（钉在顶部）。
- **首轮四条**：`CURRENT_OPENING_OPTIONS_SOURCE === "model_first_turn"`；本地选项池 **不绑定生产首屏**（见 `openingOptionPools.ts` 注释）。
- **动态开关**：`VERSECRAFT_ENABLE_DYNAMIC_OPENING_OPTIONS` 关闭时仅保留应急/回滚路径（不推荐生产）。

## 6. 前端展示清洗清单

- 玩家可见字符串优先经 `resolveNpcIdForPlayer` / `resolveTaskIssuerDisplay` 等既有解析器；**补充** `sanitizePlayerFacingText` 处理裸 `N-xxx`。
- 任务板 issuer/相关人：继续走 `displayNameResolvers`，避免直接展示内部 id。

## 7. 任务系统新可见规则（V2）

- `soft_lead` + `available`：**不进入** `partitionTasksForBoard` 的输入。
- `conversation_promise` / `formal_task` / 已 `active` 的 soft 线：**仍可按原逻辑**出现。
- 服务端 env：`VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2`；客户端：`NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2`（未设时默认 `true`，与服务器一致）。

## 8. 新手引导重构说明

- **双核主轴**（`VERSECRAFT_ENABLE_NEW_PLAYER_GUIDE_DUAL_CORE`）：老刘（生存）与麟泽（边界）在叙事与任务权重上由既有 `guidanceLevel` / 主线排序承接；本开关为 **文案与 packet 权重预留**，默认开。

## 9. Commit 稳定性修复说明

- **Final frame**：SSE 已以 `__VERSECRAFT_FINAL__:${json}` 覆盖流式缓冲（`accumulateDmFromSseEvent`）；`VERSECRAFT_ENABLE_FINAL_FRAME_FIRST_COMMIT` 为 **与客户端行为对齐的观测/强制位**，默认开。
- **指标**：`recordFinalFrameCommitOutcome`、`turnCommitParseFailureCount` 等可在 `tryParseDM` 失败路径上增量接入（本期已提供 API，路由层按需接线）。

## 10. 灰度建议

1. 预发：全开 `VERSECRAFT_ENABLE_*`（默认即全开）。
2. 若叙事过密：先关 `VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET` 或 `VERSECRAFT_ENABLE_WORLD_ENTRY_PACKETS`。
3. 若任务板过空：关 `NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2`（恢复 soft_lead 上板）。
4. 若社交表演过强：关 `VERSECRAFT_ENABLE_NPC_SOCIAL_SURFACE`。

## 11. 风险与回滚策略

| 风险 | 回滚 |
|------|------|
| 动态 suffix 变长 | 关 `STYLE_GUIDE`；调 `maxChars` |
| 任务板漏任务 | 关 V2 公共开关 |
| 空间权柄缺失导致漂移 | 关 `SPACE_AUTHORITY_CANON` 仅作临时排障（会注入 `rolloutDisabled` 占位） |

## 12. 验收案例

- 运行 `pnpm test:unit`：`phase9RolloutGoldenScenes`、`versecraftRolloutFlags`、`playerFacingText`、`taskBoardUi`。
- 手工：新开一局，确认首轮 options 来自模型、任务板无「仅 soft_lead」占位任务、对话中无裸 `N-xxx`（在清洗开启时）。

## 13. 后续二期可做项（本期故意不做）

- 全链路 OpenTelemetry 导出与仪表盘。
- 客户端 `tryParseDM` 与 `recordFinalFrameCommitOutcome` 自动打点（需避免双端重复计数）。
- 任务「叙事授予」与 DM `new_tasks` 的强一致校验（需更多状态机）。
- 老刘/麟泽的独立 script 任务链（避免与现有主线抢焦点）。

## 环境变量一览

| 变量 | 默认 |
|------|------|
| `VERSECRAFT_ENABLE_SPACE_AUTHORITY_CANON` | true |
| `VERSECRAFT_ENABLE_MONTHLY_STUDENT_ENTRY` | true |
| `VERSECRAFT_ENABLE_DYNAMIC_OPENING_OPTIONS` | true |
| `VERSECRAFT_ENABLE_PLAYER_FACING_TEXT_CLEANUP` | true |
| `VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2` | true |
| `VERSECRAFT_ENABLE_NEW_PLAYER_GUIDE_DUAL_CORE` | true |
| `VERSECRAFT_ENABLE_NPC_SOCIAL_SURFACE` | true |
| `VERSECRAFT_ENABLE_WORLD_ENTRY_PACKETS` | true |
| `VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET` | true |
| `VERSECRAFT_ENABLE_FINAL_FRAME_FIRST_COMMIT` | true |
| `VERSECRAFT_ENABLE_UI_DEBUG_DIAGNOSTICS` | false |

客户端镜像：`NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2`（默认 true）。
