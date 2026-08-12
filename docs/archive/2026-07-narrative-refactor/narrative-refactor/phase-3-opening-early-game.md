# Phase 3：开场与前五回合 —— 留存最关键的文本面

> **目标**：玩家前五分钟读到的一切（固定开场、首轮选项、开局任务、章节 beat、引导与等待文案）按新宪法重写。开场是文风的第一印象，也是"愿不愿意玩下去"的决定性界面。
> **前置**：phase-0/1/2 完成（phase-2 的节奏指令会让前五回合的 beat 设计真正生效）。**预计**：1–2 个会话。
> 本阶段完成后建议用户真实试玩验收。

---

## 0. 开始前必读

- STYLE_BIBLE §1–§7、§10、§11
- `src/features/play/opening/openingCopy.ts`（`FIXED_OPENING_NARRATIVE` 全文 + `OPENING_SYSTEM_PROMPT` 全文）
- `src/features/play/opening/coldOpening.ts`、`openingMode.ts`（`CURRENT_OPENING_OPTIONS_SOURCE = "model_first_turn"` 的语义）
- `src/app/play/page.tsx` 的开场链路：开场触发 effect（hydrate 后 turn===0 单次触发）、`hasTriggeredOpening` 守卫、`OPENING_STALL_MS = 14_000` 超时走 options-only 补拉（`requestFreshOptions("opening_fallback")`）——**这套机制一行都不改，只改文案**
- `src/lib/safety/output/fallbackNarratives.ts`（`OPENING_TURN_NEUTRAL_FALLBACK_NARRATIVE` 等兜底句）
- `src/lib/chapters/definitions.ts`（章 1「暗月初醒」的 objective/beats/endHook/targetTextChars）
- `src/lib/tasks/taskV2.ts` 的 `createStageOneStarterTasks()`（开局任务链全部文案字段）
- `src/app/intro/introContent.ts`、`src/features/play/guideContent.ts`、`src/features/play/waitUx/waitUxCopy.ts`
- `src/lib/registry/npcs.ts` 中 B1 在场 NPC（出生点是 B1：麟泽、灵伤，任务链里的电工老刘——以 registry 实际数据为准确认谁在 B1）
- e2e：`e2e/play-open.spec.ts`、`e2e/mobile-story-visual.spec.ts`、`e2e/intro-ui.spec.ts`

---

## 1. 目标与非目标

**目标**：固定开场正文重写（多候选择优）；首轮 prompt 与四选项重写；前五回合 beat 设计落入章 1；开局任务链文案重写；intro/引导/等待/兜底文案对齐。

**非目标**：开场触发机制、单请求守卫、超时补拉逻辑、`OPENING_STALL_MS`、章节系统机制、任务系统机制、任务 id 与结构字段——全部不动。只动文案与内容字段的值。

---

## 2. 执行步骤

### 3.1 通读开场链路（不改代码）

按"必读"清单读完，把以下事实核对进 PROGRESS：`FIXED_OPENING_NARRATIVE` 的渲染位置与是否分段渲染、`OPENING_SYSTEM_PROMPT` 对首轮 narrative/options 的确切要求、章 1 `targetTextChars` 的语义（约束的是什么的长度——以消费代码为准）、starter tasks 各字段哪些玩家可见、B1 实际在场 NPC 名单。

### 3.2 重写固定开场正文（多候选择优）

1. 写 **2–3 个候选**版本的 `FIXED_OPENING_NARRATIVE`，长度与现版同量级（约 1500 字，移动端分段友好：单段 ≤100 字）。
2. 每个候选必须满足的结构（黄金开场四要素）：
   - **前 100 字抓住**：具体的人 + 具体的反常。保留现版"课堂日常起手"的底子（它有自嘲潜质、亲近感好），强化"我"的性格声音（碎碎念、小算盘），删三连喻。
   - **灾变段有画面有分寸**：冲击靠动词与事实差异，不靠恐怖形容词堆叠；死亡与破坏点到为止（§7）。
   - **落地段给微小掌控感**：坠入公寓后，给"我"第一个可执行的小目标与第一次"还能行"的呼吸；如自然，可带第一个人物瞬间（B1 在场 NPC 一瞥或一句话，以 registry 为准）。
   - **结尾强钩子**：question 或 threat 型，同时埋"我要活着出去"的目标感（十日窗口可在此自然入场）——恐惧不是留下来的理由，出去才是。
3. 用 STYLE_BIBLE §12 判据 + `validateNarrativeStyle` 对三个候选逐一自评（跑得出遥测数字），择优；落选稿连同评分与落选原因存 `docs/narrative-refactor/drafts/opening-candidates.md`。
4. 选定稿加入 `benchmarks/narrative-style/cases.json` 的 golden_pass。

### 3.3 重写 OPENING_SYSTEM_PROMPT

1. 保持既有契约要求不动：极短承接 narrative + 恰好 4 条第一人称 options 的结构、JSON 输出要求。
2. 文风约束按 v3 重写；给首轮 options 的写作要求对齐 §11（四方向差异化、代价可嗅、允许一条歪点子）。
3. 显式写入第 1 回合的 beat 目标：承接固定开场的结尾钩子 + 给出四个"求生方向感"选项（探索/接触人/清点自身/观察环境之类的方向差异，以场景为准）。

### 3.4 前五回合 beat 与开局任务链

1. `src/lib/chapters/definitions.ts` 章 1：按下面的五拍重写 `beats` 与 `endHook`（`objective` 语义保持"活下来并找到方向"级别，措辞可改）：
   - 拍 1 落地求生（掌控感，wit/suspense）→ 拍 2 第一个人物瞬间（warmth 或 levity，B1 NPC）→ 拍 3 第一个诡异事实差异（suspense，§7 式）→ 拍 4 第一个小目标达成（payoff 小爽点，对应 starter task 首环）→ 拍 5 章末钩（reveal 或 threat，endHook 承接）。
   - `targetTextChars` 数值不动（属于长度预算，非本阶段范围）。
2. `createStageOneStarterTasks()` 全部文案字段重写（**id、结构、grantState、奖励逻辑不动**）：
   - `title` 动词化、有拉力（"走出去"保留——这个 title 已经很好）。
   - `desc` 三要素齐备：要达成什么 / 代价或风险是什么 / 从哪入手（目标与代价前置，§9 技法 1）。
   - `playerHook` 一句拉力；`nextHint` 具体到"现在去找谁问什么"；`issuerIntent`/`spokenDeliveryStyle`/`taboo` 对齐 phase-4 前的人设锚点（老刘"嘴硬心软"已有，保持并强化）。
3. 自检：每条任务文案读起来是否让玩家清楚"做了有什么好处、不做有什么后果、下一步点哪"。

### 3.5 周边文案对齐

1. `introContent.ts`：入场卡片与背景介绍按新基调微调——强调"十日之约、走出去、楼里的人"，弱化纯恐怖话术；世界观事实不改。
2. `guideContent.ts`：新手指引文案对齐语气（简洁、带一点"我"的幽默）。
3. `waitUxCopy.ts`：等待文案可以有趣（世界内趣味 > 系统式"生成中"），但不过度承诺、不剧透。
4. `fallbackNarratives.ts`：兜底句保持中性承接职能，语气对齐 v3（不带恐怖形容词）；`SAFE_FALLBACK_NARRATIVE.ts` 同（注意该文件现版是第二人称"你"——若确认它会作为 narrative 展示，改为第一人称并记入 Deviations；以消费代码为准）。

### 3.6 e2e 与多视口回归

1. `pnpm test:e2e:contract`（含 play-open）与 `e2e/intro-ui.spec.ts`、`e2e/mobile-story-visual.spec.ts` 相关项；断言依赖旧文案字符串的，同步更新断言。
2. 三档视口（390×844 / 393×852 / 430×932）检查开场正文排版：段落长度、首屏信息量；用 Playwright 截图或 DOM 证据确认（保留全部 data-testid）。

### 3.7 评测全套 + 基线

`pnpm test:unit` → `eval:narrative-style:mock`（新开场进 golden 后）→ 三个现有 mock eval + `benchmark:chat:mock` → 结果写 `baselines/<日期>-phase-3.md`。开场正文的 styleValidator 遥测与 phase-0 基线里的旧开场对照（spread、感官、比喻密度应全面改善）。

---

## 3. 硬性禁止

- 不改开场触发机制/单请求守卫/超时补拉/`OPENING_STALL_MS`/`CURRENT_OPENING_OPTIONS_SOURCE`。
- 不改任务 id、任务结构字段、grantState、奖励；不增删任务链节点（文案重写 ≠ 重设计任务图）。
- 不改章节系统机制与 `targetTextChars` 数值。
- 世界观事实（root canon、楼层机制、NPC 身份）一字不改；不提前泄漏 DM-only 真相。
- 不删 data-testid。

---

## 4. 验收清单

- ✅ `pnpm test:unit`、`npx eslint .`
- ✅ `pnpm eval:narrative-style:mock` gatePass（含新开场 golden）
- ✅ 三个现有 mock eval + `pnpm benchmark:chat:mock` 全绿
- ✅ `pnpm test:e2e:contract` 及 intro/mobile-story 相关 spec 全绿
- ✅ 三视口排版证据留存；drafts/ 有落选候选归档
- ✅ `baselines/` phase-3 文件 + PROGRESS 更新，NEXT 指向 phase-4

## 5. 汇报

按 CLAUDE.md §15。额外必须包含：候选数量与择优依据（遥测数字）、新旧开场遥测对照表、提醒用户"建议真实网关试玩验收前五回合"。
