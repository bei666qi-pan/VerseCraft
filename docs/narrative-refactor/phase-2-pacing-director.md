# Phase 2：节奏导演闭环 —— 让节奏系统从 observer 变成驱动

> **目标**：情绪档位轮换、钩子类型轮换、意象轮换、情绪出口——STYLE_BIBLE §2/§4 的节奏法则，从"写在纸上"变成"每回合真的发生"。手段：节奏账本（DB）+ 每回合确定性节奏指令 packet + 结尾钩子强制改写通道。
> **前置**：phase-0、phase-1 完成。**预计**：2–3 个会话。
> **延迟纪律（本阶段最要命）**：首字前禁止新增模型调用；新增 DB 读必须短超时 fail-open；写必须非阻塞；改写只在 final hooks lane 且只在校验失败时触发。

---

## 0. 开始前必读

- STYLE_BIBLE §2（档位与法则）、§4（钩子）、§12（判据）
- `docs/turn-engine-architecture.md` 全文（9 阶段管线与 transitional 债务）
- `src/lib/worldEngine/directorState.ts`（已有张力状态机：tension/mystery/fatigue/progress/agency_health/reveal_pressure + phase，落库 `world_engine_director_state`）
- `src/lib/worldEngine/agenda.ts`（`loadDueDirectorAgenda()` 的短超时 fail-open 模式与 `markDirectorAgendaInjected`）
- `src/lib/turnEngine/pacing/validatePacing.ts` + `pacing/types.ts`（BeatState 与揭示预算）
- `src/lib/turnEngine/routeTurnLane.ts`（lane 已读 directorTension/directorBeat）
- `src/app/api/chat/route.ts`：近回合窗口与 `TTFT_HARD_CAP_SESSION_MEMORY_MS = 140` 的 fail-open 读法；`runStreamFinalHooks` 相位链；options 修复的编排方式（`generateOptionsOnlyFallback` 如何被调起）——**尾段改写要抄这套编排**
- `src/lib/ai/logicalTasks.ts`：`repairNarrativeOnly` / `expandNarrativeOnly`（"只换 narrative 不动结构字段"的既有实现）
- `src/lib/turnEngine/commitTurn.ts`：`applyNarrativeOverride` 与 commitFlags
- `src/db/schema.ts`：`world_engine_*` 表如何标识会话（**本阶段新表沿用同一会话标识约定**）
- `src/lib/turnEngine/chatPerf.ts`（ENV → flags 的既有开关机制）
- `src/lib/playRealtime/playerChatSystemPrompt.ts` 的 `PlayerDmDynamicSuffixInput`（已有 styleGuideBlock / narrativeBudgetBlock 等注入位——新 packet 照这个模式加）

---

## 1. 目标与非目标

**目标**：① 节奏/伏笔两张新表；② 回合档位分类落库；③ 每回合节奏指令 packet（确定性、灰度开关）；④ 结尾钩子强制 + 定向尾段改写；⑤ 情绪配比软守卫。

**非目标**：不改主模型调用次数与时序；不动 lane 路由语义（读 ledger 丰富 director 输入可以，改 FAST/RULE/REVEAL 判定规则不行）；不做伏笔的完整闭环（表建好、phase-5 启用）；不改 UI。

---

## 2. 执行步骤

### 2.1 核查节奏底座现状（不改代码）

1. 确认 `validatePacing` 当前是否真的在 Phase-8.5 被调用、其 report 是否已进 `commitTurn`（架构文档自述 lane 决策是 observer，需要核实 pacing 校验的实际接线状态）。
2. 确认 `directorState` 的在线读取路径（是否已随 `loadDueDirectorAgenda` 一起进入回合上下文）。
3. 确认 `world_engine_*` 表的会话标识字段与写入模式（fire-and-forget 在哪实现）。
4. 结论写 PROGRESS；与本文件描述不符处记 Deviations 并按代码事实调整后续步骤。

### 2.2 新表 migration【push 待人工确认】

在 `src/db/schema.ts` 新增两表（会话标识沿用 2.1 查明的约定；命名与现有表风格一致）：

1. `narrative_pacing_ledger`：`id`、会话标识、`turn_index`、`register`（五档位枚举字符串）、`beat`（沿用 BeatState 词表）、`hook_type`、`imagery_keys`（jsonb，字符串数组）、`is_payoff`（boolean）、`created_at`。
2. `narrative_foreshadow_ledger`：`id`、会话标识、`seed_text`、`source`（`dm` / `world_engine` / `task`）、`planted_turn`、`status`（`planted` / `reinforced` / `paid_off` / `expired`）、`deadline_turn`、`importance`（int）、`payoff_turn`（nullable）、`created_at`、`updated_at`。

`pnpm db:generate` 生成 migration，提交文件，**停在这里等人工 `db:push` 确认**（PROGRESS 标注"待 push"）。等待期间可用本地 Postgres（`pnpm postgres:local`，先读脚本确认）继续开发。运行时代码对表不存在必须容错（fail-open，与 `db:check:optional` 的软门哲学一致）。

### 2.3 回合档位分类落库

1. 在 `runStreamFinalHooks` 的 commit 完成之后（或 `enqueueBackgroundTick` 的入队路径里，二选一，选改动面更小、且在 final 帧发出后执行的位置），调用 phase-0 的 `registerClassifier` 对 committed narrative 分类，连同 hookType（styleValidator telemetry 已产出）、beat、imagery keys（从 imagery_bank 词表匹配提取）写入 `narrative_pacing_ledger`。
2. 写入必须 fire-and-forget（`void promise` + catch 吞错 + 遥测），照抄 analytics/world tick 的写法。失败不影响回合。
3. 单测：分类与提取的纯函数部分。

### 2.4 节奏指令 packet（本阶段核心）

1. 新建 `src/lib/playRealtime/narrativeDirectivePackets.ts`，导出纯函数 `buildNarrativeDirectiveBlock(input)`：
   - 输入：`{ recentLedger: 最近 8–10 行; directorState?: 现有张力状态; dayHour?: 时间; chapterBeatHint?: string; dueForeshadow?: []（本阶段恒空，phase-5 启用） }`。
   - 输出：≤400 字符的中文指令块，内容按 STYLE_BIBLE §2/§4 规则推导：
     - 本回合**建议主档位**（三回合法则：最近 2 回合同档 → 强制换档建议；director phase 为 recovery → 建议 levity/warmth；pressure/reveal → 建议对应档）。
     - 本回合**建议钩子类型**（轮换：排除最近 2 回合已用类型）。
     - 是否需要**情绪出口**（上一回合为高压 peak → 是）。
     - **意象回避清单**（最近 2 回合已用的 imagery_keys，提示"本回合不要再用：灯管、刮擦…"）。
     - **倒计时提醒**（距上次时间压力提及 ≥4 回合 → 提示自然带一句）。
   - 语言必须是**建议式**（"本回合优先…"），不与玩家意图和规则裁决抢权威；不包含任何 DM-only 事实。
   - 纯函数 + 完整单测（构造账本序列断言各规则触发）。
2. 注入：`PlayerDmDynamicSuffixInput` 新增可选字段 `pacingDirectiveBlock`，在 `buildDynamicPlayerDmSystemSuffix` 拼接（位置与 styleGuideBlock 相邻）；`route.ts` 在组装动态 suffix 处传入。
3. 数据读取：ledger 最近行的读取合并进回合开头已有的并行读取组（session memory / director agenda 那一组），同样 140ms 级短超时 fail-open——**超时或表不存在时 packet 为空字符串，回合完全不受影响**。
4. 灰度开关：`VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET` 的机制在 `src/lib/rollout/versecraftRolloutFlags.ts`（已核实），照它的模式新增 `VERSECRAFT_ENABLE_NARRATIVE_DIRECTIVE`，**默认关**。`.env.example` 与文档登记。开发与评测时置开。

### 2.5 结尾钩子强制 + 定向尾段改写

1. phase-0 的 `choice_preview_tail` 与 hookTaxonomy 已在 validateNarrative 桥接链路上产出 issue。本步在 route 的 final hooks 中新增编排（**照抄 options 修复的编排模式**）：`narrative_only` 回合命中 `hook_missing` 或 `choice_preview_tail` 时 → 调用新函数 `rewriteNarrativeTail()`。
2. 在 `src/lib/ai/logicalTasks.ts` 新增 `rewriteNarrativeTail()`：复用 `NARRATIVE_EXPANSION` 任务类型（enhance 主角色、7s 超时、既有预算），指令：只重写最后一段为指定类型钩子（类型取自节奏指令的轮换建议），不新增事实、不引入新实体、不改前文任何信息；输出仅新尾段文本。产物经由既有 `narrativeOverride` → `applyNarrativeOverride` 通道合入（保留全部结构化字段）。
3. 预算守卫：只在 final 剩余预算允许时触发（读 `src/lib/perf/waitingConfig.ts` 的预算与既有 repair 的守卫方式，照抄）；预算不足 → 放行原文 + 遥测。任何情况下**最多改写一次**，不重试。
4. commitFlags 增加 `narrative_tail_rewrite_applied`；沿用 `narrative_validator_issue` 遥测事件记录触发原因。
5. 单测：`rewriteNarrativeTail` 的 prompt 构造与输出解析；改写失败/超时时的降级路径。

### 2.6 情绪配比软守卫

1. `validateNarrative` 入参扩展：可选 `recentRegisters: string[]`（route 侧把 ledger 读到的近期档位传入；保持纯函数）。
2. 新 issue `register_repetition`（soft，仅遥测）：本回合分类档位与最近 2 回合相同 → 记录。**不拦截、不改写**——纠偏靠 2.4 的前置指令，验证靠遥测趋势。

### 2.7 节奏评测与全套回归

1. `narrativeDirectivePackets` 单测覆盖全部规则分支；`benchmarks/narrative-style/cases.json` 补充带 `sceneContext.expectedRegister` 的用例验证 registerClassifier。
2. 开关关闭状态：全套评测 + `pnpm test:e2e:contract` + `pnpm benchmark:chat:mock`，证明默认行为零变化。
3. 开关打开状态（本地）：`pnpm test:e2e:mock` + `benchmark:chat:mock` 再跑一遍，证明打开后延迟仍达标、契约不破。
4. 两种状态的结果都写入 `baselines/<日期>-phase-2.md`。

---

## 3. 硬性禁止

- 首字前路径新增模型调用；ledger 读取无超时守卫；ledger 写入阻塞回合。
- 尾段改写：改结构化字段、引入新实体/新事实、重试超过一次、绕过 `applyNarrativeOverride` 通道自拼 JSON。
- 改 `routeTurnLane` 的 lane 判定规则；改 SSE 帧语义；改 DM JSON 契约（本阶段不需要任何契约字段变更）。
- 执行 `pnpm db:push`（生成 migration 后等人工确认）。
- 新开关默认开启（必须默认关，phase-6 决定翻默认）。

---

## 4. 验收清单

- ✅ `pnpm test:unit`、`npx eslint .`、`pnpm exec tsc --noEmit`
- ✅ migration 已生成并提交，PROGRESS 标注"待 push"；运行时对表缺失 fail-open 有测试或代码证据
- ✅ 开关关：全套 mock eval + `test:e2e:contract` + `benchmark:chat:mock` 全绿（默认零变化）
- ✅ 开关开：`test:e2e:mock` + `benchmark:chat:mock` 全绿（打开也不超预算）
- ✅ `baselines/` phase-2 文件 + PROGRESS 更新，NEXT 指向 phase-3

## 5. 汇报

按 CLAUDE.md §15。额外必须包含：新表结构与"待 push"提示、开关名与默认值、尾段改写的触发条件/预算守卫/降级路径说明、两种开关状态的延迟数据对比。
