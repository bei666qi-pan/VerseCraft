# Phase 5：伏笔-兑现系统、任务戏剧化与结算高光

> **目标**：让"埋下的会响，投入的有回报"成为系统保证：伏笔账本全链路启用、爽点按节拍兑现、任务文案戏剧化、死亡结算变成"意难平 + 再来一局"的动机界面。
> **前置**：phase-0/1/2/3/4 完成，且 phase-2 的两张表已由用户确认 `db:push`。**表未 push 则本阶段不得开始**（5.2 起强依赖 `narrative_foreshadow_ledger`）。**预计**：2 个会话。

---

## 0. 开始前必读

- STYLE_BIBLE §5（爽点系统）、§4（钩子）、§9（目标与代价前置、单元+主线双层）
- `src/lib/tasks/taskV2.ts`（`GameTaskV2` 全字段语义，尤其 dramaticType / playerHook / residueOnComplete / residueOnFail）
- `src/lib/registry/majorNpcQuestHooks.ts`、`majorNpcBranchSeeds.ts`
- `src/lib/worldEngine/`：`engine.ts`、`agenda.ts`（reasoner 产物中的 `player_private_hooks` 如何入库与注入）、`directorState.ts`
- `src/features/play/turnCommit/resolveDmTurn.ts`（new_tasks/task_updates 落地、`MAX_NEW_TASKS_PER_TURN = 3`、`deriveCompletedTaskToast`）
- `src/lib/playRealtime/normalizePlayerDmJson.ts`（新契约字段的 normalize 落点）
- `src/lib/turnEngine/commitTurn.ts`（`COMMIT_STATE_CHANGING_FIELDS` 与安全硬门剥离逻辑）
- `src/app/settlement/page.tsx` + `src/lib/settlement/rules.ts` + 结算快照的来源（`endingState.settlementSnapshot` 与 legacy 路径）
- `e2e/settlement-layout.spec.ts` 与五个 ending spec
- CLAUDE.md §5.2（DM JSON 字段变更的全链路检查清单——5.2 步骤必须逐项走完）
- phase-2 的 `narrativeDirectivePackets.ts` 与两张 ledger 表

---

## 1. 目标与非目标

**目标**：① DM JSON 新增可选字段 `foreshadow_ops` 全链路接线；② 伏笔兑现调度（到期提醒进节奏指令、过期治理、world engine 离线播种）；③ 任务里程碑与章节 endHook 的爽点节拍；④ 结算页"本局高光"；⑤ 任务文案戏剧化。

**非目标**：不改任务系统机制（上限、grantState、奖励结算）；不把 reasoner 拉进在线链路（离线播种走既有 worker/agenda 通道）；不重做结算页布局（新增一个分节，既有结构不动）。

---

## 2. 执行步骤

### 5.1 通读钩子链（不改代码）

核对进 PROGRESS：`player_private_hooks` 从 reasoner 输出到 agenda 的真实路径与数据形状；`residueOnComplete/residueOnFail` 当前是否有运行时消费；结算快照的字段形状与两条来源路径；`deriveCompletedTaskToast` 的文案生成位置。

### 5.2 DM JSON 可选字段 `foreshadow_ops`【契约变更，走满检查清单】

1. 字段设计：`foreshadow_ops?: Array<{ op: "plant" | "reinforce" | "payoff"; id?: string; text: string; importance?: 1|2|3 }>`。可选、缺省 `[]`、服务端补全；对旧客户端零影响。
2. 按 CLAUDE.md §5.2 清单逐文件接线：
   - `normalizePlayerDmJson.ts`：normalize（裁剪 text 长度、丢弃非法 op、上限每回合 3 条）。
   - `resolveDmTurn.ts`：透传 + 镜像进合适的 changes 分组（对齐现有双写模式）。
   - `commitTurn.ts`：加入 `COMMIT_STATE_CHANGING_FIELDS`（安全硬门触发时随其他状态字段一起剥离）。
   - `route.ts` final hooks：commit 后把 ops 非阻塞写入 `narrative_foreshadow_ledger`（plant 建行；reinforce/payoff 按 id 或 text 相似匹配更新状态，匹配不到则降级为 plant 并遥测）。
   - stable prompt 的进阶字段段：新增一行说明（何时 plant/payoff、text 写"事实种子"而非答案）——**这会再次 bump `VERSECRAFT_DM_STABLE_PROMPT_VERSION`**，流程同 phase-1。
   - 单测：normalize 边界用例；`e2e/chat-sse-contract.spec.ts` 跑通（可选字段不破契约）。
3. 播种三来源约定（写进代码注释与本文件即可，不需要新配置）：DM 主动 plant；world engine 的 `player_private_hooks` 由 worker 侧映射为 plant 行（source=`world_engine`，在 worker/agenda 消费路径实现，**不碰在线路径**）；任务 `residueOnComplete/residueOnFail` 完成时映射为 plant 行（source=`task`，在 task_updates 落地处实现）。三来源写入都去重（text 相似度粗判即可）。

### 5.3 兑现调度

1. `buildNarrativeDirectiveBlock` 的 `dueForeshadow` 输入启用：回合开头的 fail-open 读取组里查 `status=planted 且 (当前回合 ≥ deadline_turn - 3)` 的最多 2 条，指令写"如剧情自然，本回合可回收伏笔：〈seed 摘要 ≤30 字〉"。**建议式**，不强制。
2. deadline 默认规则：plant 时 `deadline_turn = planted_turn + (importance × 8)`（importance 1→8 回合、3→24 回合）；过期 → `expired` + 遥测（过期率是后续内容调优的仪表）。
3. payoff 闭环：DM 发 payoff op（5.2 已接）或 registerClassifier 判为 payoff 档且 directive 曾提示回收 → 标记 `paid_off` 并在 pacing ledger 记 `is_payoff=true`。
4. 单测：伏笔生命周期状态机（plant → due 提醒 → paid_off / expired）纯函数部分全覆盖。

### 5.4 爽点节拍：里程碑、endHook、结算高光

1. `deriveCompletedTaskToast` 文案升级：完成/失败 toast 按 §5 爽点语气重写（一句话、有分量、不系统腔）；单测同步。
2. 章节 `endHook` 与任务里程碑对齐：核对章 1（phase-3 已设计）之后的动态章节生成逻辑，把"章末必有大爽点或大揭示"写进其生成规则（找到动态章节的生成 prompt/代码后按现状最小接入；找不到明确落点则记 Deviations 并只做文档约定）。
3. 结算页"本局高光"分节：
   - 数据：从 `narrative_pacing_ledger` 取本局 `is_payoff=true` 与 hook_type=reveal 的回合（上限 3 条），进入结算快照的**新增可选字段**（旧快照无此字段 → 分节不渲染，向后兼容）。
   - 渲染：`settlement page.tsx` 在既有 `StorySection` 序列中插入"本局高光时刻"分节，风格沿用现有纸面组件；死亡局在"死亡记录"块之后展示（先高光后死亡记录或反之，以现有视觉节奏为准微调）。
   - 结算导出的写作稿（"导出本局写作稿"）同步带上高光分节。
   - `e2e/settlement-layout.spec.ts` 与 ending specs 更新断言。

### 5.5 任务文案戏剧化 pass

1. 静态部分 phase-3 已完成（starter 链）。本步处理**动态任务**：找到 DM 生成 `new_tasks` 的 prompt 指导段（stable prompt 任务段或任务相关 packet），按"目标/代价/入手三要素 + playerHook 拉力"重写生成要求；`MAX_NEW_TASKS_PER_TURN=3` 与 normalize 规则不动。
2. `majorNpcQuestHooks.ts` 的钩子文案按声音卡（phase-4）过一遍语气。
3. 抽查：mock 或 live 跑数回合，看生成任务的文案是否达标；不达标回到 prompt 指导段迭代（≥2 轮）。

### 5.6 回归全套

`pnpm test:unit`（含伏笔状态机、normalize、toast 单测）→ `pnpm exec tsc --noEmit` → `eval:narrative-style:mock` → 起 mock 服务：三个现有 eval + `benchmark:chat:mock` → `pnpm test:e2e:contract` + `settlement-layout` + ending specs。结果写 `baselines/<日期>-phase-5.md`。

---

## 3. 硬性禁止

- `foreshadow_ops` 之外不新增契约字段；该字段必须可选、缺省安全、旧存档/旧客户端零影响。
- 伏笔 text 不得包含 DM-only 真相原文（种子是"现象"，不是"答案"；写入前过一遍 epistemic 自查）。
- 在线路径不新增模型调用；ledger 读写延迟纪律同 phase-2。
- 结算快照改动必须向后兼容；不重排结算页既有分节。
- 不改任务上限、grantState、奖励逻辑。

---

## 4. 验收清单

- ✅ `pnpm test:unit`、`npx eslint .`、`pnpm exec tsc --noEmit`
- ✅ `pnpm test:e2e:chat`（契约含可选新字段仍绿）、`pnpm test:e2e:contract`
- ✅ settlement 相关 e2e 全绿（新分节 + 旧快照兼容两种情况）
- ✅ 全部 mock eval + `benchmark:chat:mock` 全绿
- ✅ 伏笔生命周期单测全覆盖；过期率遥测可见
- ✅ `baselines/` phase-5 文件 + PROGRESS 更新，NEXT 指向 phase-6；提醒部署 bump `VERSECRAFT_DM_STABLE_PROMPT_VERSION`

## 5. 汇报

按 CLAUDE.md §15。额外必须包含：`foreshadow_ops` 契约检查清单逐项完成证据、三播种来源的落点文件、结算兼容性说明、prompt 版本 bump 提醒。
