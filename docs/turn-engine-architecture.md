# Turn Engine Architecture

> 本文档用于描述 VerseCraft 在线主游玩回合的**当前实际**执行结构。
> 所有内容基于仓库真实代码；凡仍属于过渡兼容的部分，文中均会显式标记。

---

## 0. TL;DR

一次玩家回合 (`POST /api/chat`) 被拆成 **9 个阶段**，按编译器风格顺序执行：

| 阶段 | 目标 | 关键落点文件 |
| ---- | ---- | ------------ |
| Phase 1 | 安全 / 校验 / 风险分 lane | `src/app/api/chat/route.ts`, `src/lib/security/*`, `src/lib/turnEngine/preflight.ts` |
| Phase 2 | Control preflight + 规范化意图 | `src/lib/turnEngine/preflight.ts`, `src/lib/turnEngine/normalizePlayerInput.ts` |
| Phase 3 | Turn lane 路由 + 预算/Runtime Lore | `src/lib/turnEngine/routeTurnLane.ts`, `src/lib/turnEngine/runtimeLore.ts` |
| Phase 4 | Epistemic filter + prompt 组装 | `src/lib/turnEngine/epistemic/*`, `src/lib/turnEngine/promptAssembly.ts` |
| Phase 5 | 主模型流式输出 | `src/lib/ai/service.ts` + gateway |
| Phase 6 | final hooks + `applyNpcConsistencyPostGeneration` | `src/lib/npcConsistency/validator.ts`, `runStreamFinalHooks` |
| Phase 7 | `resolveDmTurn` + turn-mode 校正 | `src/features/play/turnCommit/resolveDmTurn.ts` |
| Phase 8.5 | **Post-generation `validateNarrative` + `commitTurn`** | `src/lib/turnEngine/validateNarrative.ts`, `src/lib/turnEngine/commitTurn.ts` |
| Phase 9 | SSE final 帧 + 后台 `scheduleBackgroundWorldTick` | `src/lib/turnEngine/enqueueBackgroundTick.ts`, `src/lib/worldEngine/queue.ts` |

数据面真相源链条：

```
玩家原始输入
  → NormalizedPlayerIntent (Phase 2)
  → TurnLaneDecision (Phase 3，可观察，暂未产生控制面副作用)
  → 主模型候选 DM JSON (Phase 5)
  → npcConsistency 改写 (Phase 6)
  → resolveDmTurn envelope (Phase 7)
  → validateNarrative + commitTurn（Phase 8.5）← 真正的“可提交对象”
  → __VERSECRAFT_FINAL__ 帧 + 后台 world tick (Phase 9)
```

---

## 1. 核心类型

### 1.1 `TurnLane` — 语义执行赛道

声明于 `src/lib/turnEngine/types.ts`：

- `FAST`    —— 简单叙事步（"继续", "观察周围"），结构化 delta 基本为空。
- `RULE`    —— 默认规则驱动回合；大多数玩法属于这一类。
- `REVEAL`  —— 认知 / reveal 高权重（审问、破谜、NPC 破防）。

> **当前状态**：`routeTurnLane` 已落地并在 Phase 3 被显式调用；decision 会通过 `turn_lane_decided` analytics 事件写出，便于 rollout 观察。**但 lane 尚未反向控制 pipeline 行为**（例：FAST 还没有真正跳过 B1/equipment 守卫）。这是下一轮重点项。

### 1.2 `NormalizedPlayerIntent`

字段见 `src/lib/turnEngine/types.ts`。由 `normalizePlayerInput.ts` 从 moderated + anti-cheat 后的原文 + control preflight 结果合并得到。下游所有 guard / validator / delta 合成都吃这个结构。

### 1.3 `StateDelta`

最小结构化事实集合。字段覆盖：

- `isActionLegal` / `illegalReasons`
- `consumesTime` / `timeCost`
- `sanityDamage` / `hpDelta` / `originiumDelta`
- `isDeath`
- `playerLocation`
- `npcLocationUpdates`, `npcAttitudeUpdates`
- `taskUpdates`, `newTasks`
- `mustDegrade`

> **当前状态（transitional）**：authoritative 的权威状态仍是 `resolveDmTurn` + `applyDmChangeSetToDmRecord` 产物；`StateDelta` 目前更像 **观察者 + post-generation validator 的输入**。真正把 delta 作为主真相源是后续重构目标之一。

### 1.4 `EpistemicFilterResult`

声明于 `src/lib/turnEngine/epistemic/types.ts`，把事实按认知桶分类：

- `dmOnlyFacts` —— 剧情真相，普通 NPC 不知
- `scenePublicFacts` —— 场景内公共可见
- `playerOnlyFacts` —— 玩家专属私密
- `actorScopedFacts` —— 当前 focus NPC 私有知识
- `residueFacts` —— 情绪残响（可"隐约表现"但不明说）

> **当前状态（transitional）**：`EpistemicFilterResult` 已生成且用于 `validateNarrative` 的 DM-only leak 检测与 reveal tier breach telemetry，**但 prompt 组装层还没有严格只吃过滤后的 facts**。prompt 侧仍可能从 session memory / runtime packets 拉到未经过滤的全局摘要。这是下一轮第二高优先级修复项。

### 1.5 `NarrativeValidationReport`

由 `validateNarrative(...)` 生成，含：

- `issues`：`NarrativeValidationIssue[]`
- `optionsOverride`：窄选项改写（medium 级问题）
- `narrativeOverride`：安全叙事完全回退（high 级问题）
- `telemetry`：`byCode` 聚合计数

### 1.6 `TurnCommitSummary`

由 `commitTurn(...)` 生成。含 `deltaSummary` / `commitFlags` / `validatorIssueCounts`。作为 **事实提交 vs 文案生成** 分离的可审计产物，会被发送为 `turn_commit_summary` analytics 事件。

---

## 2. 模块目录速查

### 2.1 Turn Engine 主干

```
src/lib/turnEngine/
├─ types.ts                 # 全部核心类型
├─ normalizePlayerInput.ts  # raw → NormalizedPlayerIntent
├─ routeTurnLane.ts         # intent + 风险标签 → TurnLaneDecision
├─ preflight.ts             # control preflight，含预算竞争
├─ chatPerf.ts              # ENV → ChatPerfFlags
├─ runtimeLore.ts           # 预算化 lore 检索
├─ promptAssembly.ts        # 组装主模型 prompt
├─ computeStateDelta.ts     # pre / post-narrative delta 合成
├─ renderNarrative.ts       # delta + filter → 候选叙事
├─ epistemic/               # 认知桶分类 + telemetry
│   ├─ types.ts
│   ├─ filterFacts.ts
│   └─ buildEpistemicInput.ts
├─ validateNarrative.ts     # Phase-8.5 post-gen validator
├─ commitTurn.ts            # Phase-8.5 显式提交
├─ enqueueBackgroundTick.ts # Phase-9 非阻塞后台 world tick
├─ sse.ts                   # SSE 帧工具 + status/final 常量
└─ fallback.ts              # 降级成品
```

### 2.2 相关支撑体系

- `src/lib/security/*` —— chatValidation、risk lane、output moderation
- `src/lib/ai/service.ts` / `src/lib/ai/logicalTasks.ts` —— 对 gateway 的统一入口
- `src/lib/npcConsistency/validator.ts` —— Phase-6 NPC 一致性改写
- `src/lib/worldEngine/*` —— `detectWorldEngineTriggers` / `enqueueWorldEngineTick` / worker
- `src/features/play/turnCommit/resolveDmTurn.ts` —— turn envelope 收口
- `src/features/play/stream/sseFrame.ts` —— 客户端 SSE 解包（fold / final / status）

---

## 3. Post-generation validator 规则集

`validateNarrative` 当前检查的 issue codes：

| code | 严重度 | 说明 | 处理策略 |
| ---- | ---- | ---- | ---- |
| `dm_only_fact_leaked_in_narrative` | high | narrative 含 DM-only 事实的 3-grams CJK 关键词 | safe narrative override |
| `location_conflict_with_delta` | medium | `dm.player_location` ≠ `delta.playerLocation` | 记录并用 fallback 选项 |
| `reveal_tier_breach` | medium | filter telemetry `revealGatedCount > 0` | 记录并 fallback |
| `offscreen_npc_referenced_in_options` | medium | option 引用场外 `N-xxx` | options override |
| `options_empty_or_degenerate` | low | options 为空/长度不足 | options override |
| `options_duplicate_only` | low | options 全部相同 | options override |
| `options_conflict_with_scene_affordance` | medium | degrade turn 仍提战斗动词 | options override |
| `inventory_conflict` | medium | narrative 声称拾取但 `awarded_items` 空 | options override（不覆写 narrative） |
| `time_feel_drift` | low | narrative 说"过了几十分钟"但 `consumesTime=false` | 仅 telemetry |
| `task_mode_mismatch` | low | narrative 说"任务完成"但无 task delta | 仅 telemetry |
| `npc_consistency_bridge` | low | 桥接 `applyNpcConsistencyPostGeneration` 问题数 | 仅 telemetry，报表聚合 |

---

## 4. SSE / JSON 契约

真实合约见 `src/app/api/chat/route.ts`、`src/lib/playRealtime/normalizePlayerDmJson.ts`、`src/features/play/stream/sseFrame.ts`：

- Content-Type：`text/event-stream; charset=utf-8`
- 未配置网关时仍返回 **200 + SSE**，并带 `X-VerseCraft-Ai-Status: keys_missing`
- 控制帧：`__VERSECRAFT_STATUS__:{...}` —— 客户端累积时必须忽略
- 终帧：`__VERSECRAFT_FINAL__:<json>` —— **覆盖**之前所有 DM 正文累积
- 最低 DM JSON 必需字段：`is_action_legal`, `sanity_damage`, `narrative`, `is_death`
- 服务端会补齐：`consumes_time`, `options`, `currency_change`, `new_tasks`, `task_updates`, `codex_updates`, `relationship_updates`, `awarded_items`, `awarded_warehouse_items`, `player_location`, `npc_location_updates`, `bgm_track` 等

**测试入口**：

- `src/lib/turnEngine/sse.test.ts` —— 单元 + envelope 契约
- `src/features/play/stream/sseFrame.test.ts` —— 客户端侧 fold / final / status
- `src/lib/playRealtime/chatRouteContract.test.ts` —— 必要字段不丢失的静态快照

---

## 5. Analytics 事件

Phase-5 新增事件名（声明于 `src/lib/analytics/types.ts`）：

- `turn_lane_decided` —— lane 决策分布
- `turn_commit_summary` —— 每回合 `commitTurn` 结果（含 deltaSummary, commitFlags, validatorIssueCounts）
- `narrative_validator_issue` —— validator 触发时写入，payload 含 `issueCodes` / `byCode`
- `world_engine_enqueued` —— 后台 tick 实际入队（由 `onSettled` 回调写入）

这些事件都是**非阻塞**发射；失败时 `.catch(() => {})` 不影响主流。

---

## 6. Background world tick

入口：`src/lib/turnEngine/enqueueBackgroundTick.ts`

```ts
const { decision, pending } = scheduleBackgroundWorldTick({ ... });
// Phase-9: 故意不 await — 在线回合不被后台 RTT 拖慢。
void pending;
```

关键保证：

- `decideBackgroundTick` 是纯函数，同步返回触发条件。
- `pending` 负责 `enqueueWorldEngineTick` 的实际 RTT，错误被 swallow。
- `onSettled({ decision, result })` 写 `world_engine_enqueued` analytics。
- Worker：`scripts/vc-worker.ts` 消费 `WORLD_ENGINE_TICK`，落到 `world_engine_runs` / `world_engine_event_queue` / `world_engine_agenda_snapshots`。

---

## 7. 仍属于 transitional compatibility 的点

以下位置**当前代码就这样**，并且已经在该模块自身的注释或 TODO 中显式标记：

1. `turnExecutionContext.lane` 是 observer，不改变 pipeline 行为。
2. `computePostNarrativeDelta` 仍从 `dmRecord` 反向派生 delta（而不是先产 delta 再渲叙事）。
3. `EpistemicFilter` 没有回接进 prompt 组装，只用于 validator 输入。
4. `applyNpcConsistencyPostGeneration` 的改写发生在 `validateNarrative` 之前，因此 validator 只能桥接 telemetry，而不是接管它的改写。
5. `controlPreflightBudget.contract.test.ts` / `chatRouteContract.test.ts` 是**按源码 grep 快照的契约测试**，当 route.ts 继续瘦身时需要把 grep 范围同步迁移（当前已支持在 `turnEngine/preflight.ts` + `turnEngine/chatPerf.ts` 中查找）。

---

## 8. 调试 & 排障入口

| 场景 | 入口 |
| ---- | ---- |
| 看 lane 分布 | analytics 表 `analytics_events`，`eventName = 'turn_lane_decided'` |
| 看 commit 回合摘要 | `eventName = 'turn_commit_summary'`，payload.deltaSummary/commitFlags |
| 看 validator 触发详情 | `eventName = 'narrative_validator_issue'`，payload.byCode |
| 看后台 tick 是否入队 | `eventName = 'world_engine_enqueued'` |
| 看认知过滤桶计数 | `epistemicDebugLog` + `filter.telemetry.bucketCounts` |
| 看 lore 预算是否命中 | `loreBudgetHit` 字段，`eventName = 'chat_request_finished'` |

本地调试开关：`VERSECRAFT_EPISTEMIC_DEBUG_LOG=1` 打开 `epistemicDebugLog`。

---

## 9. 运行命令

- `pnpm dev` —— 本地开发（端口 666）
- `pnpm test:unit` —— 含本文描述的全部 turnEngine 单测
- `pnpm test:e2e:chat` / `pnpm test:e2e:contract` —— SSE 契约 E2E
- `npx eslint .` —— lint
- `pnpm run ship -- "feat: msg"` —— 一键提交 + 推送 main

---

## 10. 下一轮高价值改造项

以下顺序按"收益 / 风险比"，是当前架构**偏离目标仍然最多**的地方：

1. **lane 决策真正产生副作用**：`FAST` 跳过 B1/equipment guard + runtime lore retrieval；`REVEAL` 强制走 `applyNpcConsistencyPostGeneration` + `validateNarrative`。否则抽象层永远停在 observer。
2. **`EpistemicFilter` 接回 prompt 组装**：让普通 NPC 的 prompt 只能看 `scenePublicFacts + actorScopedFacts`，DM-only / playerOnly 严禁回注。
3. **把 `validateNarrative.narrativeOverride` 的 fallback 粒度做细**：目前"安全叙事"过粗；应保留原 DM 的 state delta 但只替换 narrative 字符串。
4. **把 `commitTurn` 真正作为 envelope 真相源**：让 `resolveDmTurn` 读 delta 再生成 envelope，而不是反过来。
5. **统一 telemetry 入口**：把 `epistemicDebugLog` 和 `recordGenericAnalyticsEvent` 合并为一个 thin wrapper，避免事件分散。
