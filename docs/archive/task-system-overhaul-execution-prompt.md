# VerseCraft 任务系统全面重构 · 长程执行提示词 v1

> **用法**：在仓库根目录另开一个 Claude Code 窗口，输入一句话：
> 「完整阅读 docs/prompts/task-system-overhaul-execution-prompt.md，按其执行任务系统全面重构，直至完成定义（§8）全部满足。」
> 中断后续跑见附录 B。本提示词与 CLAUDE.md 并行生效；冲突时以当前代码与测试为准。
> **注意**：另一个 Claude Code 会话可能正在同仓库执行 `docs/prompts/eval-overhaul-execution-prompt.md`（测评体系升级）。§2 的双会话协作协议是硬纪律，先读它。

---

## 0. 使命与心智

你是 VerseCraft 任务（quest）系统的**总设计师兼唯一执行者**。现状判词：任务系统**没有可用性、没有可玩性、有人机味**。三大病灶已被逐文件确诊（§3）：

1. **引擎失守**：写好的状态机/完成检测/任务链/发奖四个模块是**从未接线的死代码**，生效路径没有任何转移守卫——完成的任务可被 DM 一句话复活，完成与失败 100% 押在模型自觉上，时限字段全系统无人填写，纯装饰。
2. **感知失明**：任务 tab 连红点都没有（图鉴有）、无进度显示、无真详情、auto_open 解析了但没接线、通知 best-effort——玩家可能整局不知道任务面板存在，最坏情况 10 回合卡在开局两张卡，主线零推进。
3. **文案人机味**：DM 生成任务只收到负向禁令（无正例、无 few-shot、快车道连禁令都丢了），任务标题/描述是全链路**唯一零校验的玩家可见文本**，兜底文案硬编码几句话逐字循环。

使命：三线全重构（用户已确认），交付一个**引擎可信、玩家可感、文字有人味**的任务系统。

授权心智（与 eval 会话一致）：全程自主决策不请求确认（唯一例外：§1.2 硬红线）；不因成本缩水方案；改动越多越好的前提是每步可验证、小步 commit 可回滚；不声称「已验证」除非命令真实执行。

---

## 1. 授权与硬红线

### 1.1 授权（用户已确认，2026-07-08）

1. **三线全重构**：引擎硬化 + 感知层补全 + 文案人味化，一次做透。
2. **UI 可大改**：任务面板/卡片/详情/通知可重设计；保持液态玻璃风格与 `/play` phase 交互语义；底部导航整体结构不动。
3. **旧存档不管兼容**：允许破坏任务数据兼容。但**旧存档加载不得白屏/崩溃**——检测到不可映射的旧任务数据时安全重置任务子系统（回落到新开局种子）即可，其余存档数据不受牵连。
4. 允许真实大模型调用（live playtest、文案辅助），按 §6 预算。
5. Git：main 分支小步提交，遵守 §2 双会话纪律。不 push。
6. 允许新增 devDependencies（报告列理由）；生产依赖仅确属必要。

### 1.2 硬红线（违反即停）

- 不 push、不 `pnpm run ship`、不部署、不 Coolify、不 `pnpm db:push`。
- 不破坏 `/api/chat` 契约：SSE 帧语义、DM JSON 四必填键、`keys_missing` 降级。`new_tasks`/`task_updates` 字段可**增量扩展**（新增可选字段），不可改名/删除/改既有语义而不保留兼容；改动时按 CLAUDE.md §5.2 清单同步检查并跑 `pnpm test:e2e:chat`。
- 不拆主 store；持久化新字段同步检查默认值/`partialize`/`migrate`/反序列化安全；`skipHydration` 与 `isHydrated` guard 契约不动。
- 不在 render path 访问浏览器对象；UI 文案简体中文；保留关键 `data-testid`（改名同步测试）。
- `/play` 不退化为后台面板；开场单一主请求语义不破。
- 不动 `.env*` 密钥；不 `rm -rf` / `git reset --hard` / `git clean`；不动用户与另一会话未提交的无关文件。
- 修改 `src/lib/playRealtime/playerChatSystemPrompt.ts`（高风险文件）前列影响面，改变 stable prompt 语义边界时检查 `VERSECRAFT_DM_STABLE_PROMPT_VERSION` 兼容机制。
- CLAUDE.md 其余禁止事项全部有效。

---

## 2. 双会话并行协作协议（硬纪律）

另一会话正在执行**测评体系升级**（`docs/prompts/eval-overhaul-execution-prompt.md`），与你共享同一工作区、同一 git 仓库、同一 index。

### 2.1 文件领地

**对方领地（对你只读）**：`scripts/eval-*.ts`、`scripts/benchmark-*`、`scripts/test-gate.mjs`、`src/lib/evals/**`、`benchmarks/**`、`.github/workflows/ci.yml`、`docs/eval/**`、`benchmarks/history/**`、`src/lib/ai/mock/mockScenarios.ts`（对方正在扩对抗场景）。

需要评测侧配合的一切（新增引擎不变量的评测覆盖、任务文案 lint 作为评测检测器、mock 需要新增任务场景——**mock 目前 `new_tasks` 恒为空数组**、`task_lifecycle_v1` rubric 增加文案维度、`benchmarks/task-eval` 场景重写建议），**写进 `docs/task-system/HANDOFF-to-eval.md`**，不直接改对方领地。万不得已必须改（如 mock 加任务场景否则你无法测试）：重读最新版 → 最小增量追加 → HANDOFF 登记说明。

**你的领地（独占）**：`src/lib/tasks/**`、`src/lib/play/taskBoardUi.ts`、`src/features/play/components/PlayNarrativeTaskBoard.tsx`、`src/features/play/mobileReading/**` 任务相关组件、`src/lib/ui/taskPlayerFacingText.ts`、`src/lib/contentSpec/**`、`docs/task-system/**`、任务相关 e2e spec。

**共享文件（双方都可能碰）**：`src/store/useGameStore.ts`、`src/app/play/page.tsx`、`src/features/play/turnCommit/resolveDmTurn.ts`、`src/lib/playRealtime/{normalizePlayerDmJson,playerChatSystemPrompt,runtimeContextPackets}.ts`、`src/lib/turnEngine/{validateNarrative,computeStateDelta,commitTurn}.ts`、`src/lib/narrativeStyle/**`、`CLAUDE.md`。规则：编辑前必重读最新内容；最小 diff；改完立即跑相关单测；尽快 commit 缩小冲突窗口；CLAUDE.md 只改任务系统相关行。

### 2.2 Git 并发纪律

- **用 pathspec 提交，不依赖共享暂存区**：`git commit -m "feat(tasks): ..." -- <明确路径列表>`。这能原子提交你的文件，即使对方恰好 stage 了别的东西。永不 `git add -A` / `git add .`。
- commit 前 `git status --porcelain` 观察全局；陌生改动（用户或另一会话的）一律不碰、不提交、不回滚。
- HEAD 被对方推进是常态：在新 HEAD 上继续即可；同文件冲突以「三方功能都保留」为准手工合并。
- 消息前缀区分：你用 `feat(tasks)/fix(tasks)/refactor(tasks)/test(tasks)/docs(tasks)`。

### 2.3 进程与端口纪律

- 对方会在 666（`pnpm preview`）和 3000（CI 式 `next start`）起 mock server。**禁用 `pnpm dev:fresh`**（它清理 666 端口会杀掉对方进程）；不 `pkill node`。
- 你自己起 server 用独立端口：`PORT=3210 AI_PROVIDER=mock node .next/standalone/server.js` 或 `next start -p 3210`，探活用 `curl -sf http://127.0.0.1:3210/`。
- 跑 Playwright e2e 前检查 666 占用：若是对方的 mock server，playwright `reuseExistingServer` 会复用它（AI_PROVIDER=mock 时行为兼容，可接受）；若行为异常则错峰重试，**不杀进程**。

---

## 3. 经核查的现状事实（2026-07-08 基线）

以下逐文件核实。Phase 0 抽查复核，漂移处修正进 `docs/task-system/AUDIT-2026-07.md`。

### 3.1 两套任务模型，一活一死

- **生效模型**：`GameTaskV2`（`src/lib/tasks/taskV2.ts:78-192`，40+ 字段）：`status` 5 值（active/completed/failed/hidden/available）+ 可选 `grantState` 6 值 + Phase-3 戏剧字段（`playerHook/urgencyReason/riskNote/hiddenMotive/spokenDeliveryStyle/...`）+ 阶段 4 人物驱动字段。权威状态在**客户端** zustand store（`useGameStore.ts`：`tasks` 字段、`addTask:~1695`、`updateTaskStatus:~1715`、`updateTask:~1723`、收口 `finalizeTaskMutation:~1067`）。
- **死代码引擎**：`src/lib/tasks/taskStateMachine.ts`（7 值 `QuestState` + `VALID_TRANSITIONS` 终态锁 + 5 个 guard，含 `expiresAt` "day:3,hour:18" 解析与过期转移）、`completionDetector.ts`（叙事+结构双通道完成检测）、`questChain.ts`、`rewardDelivery.ts`——**生产路径零引用**，唯一消费者是 `src/lib/tasks/questSystem.test.ts`（绿色测试制造虚假信心）。

### 3.2 引擎缺陷清单（全部有行为证据）

1. **终态可复活**：`updateTaskStatus` 直接 `{...t, status}` 无守卫；DM 一条 `task_updates:{id,status:"active"}` 可把 completed 拉回 active。奖励靠 `appliedRewardTaskIds` 幂等账本挡重复发钱（`applyTaskRewardConsequences`，`useGameStore.ts:~982`），但关系后果/职业重算/UI 状态会再次翻转。
2. **addTask 合并覆盖终态**：同 id 重发时走 `applyTaskUpdateToTask` 全量合并，而 `normalizeStatus` 缺省返回 `"active"`（`taskV2.ts:~316`）——DM 重发已完成任务的 id 即刷回 active。
3. **未知 id 静默吞**：`updateTask` 找不到 id 原样返回（`useGameStore.ts:~1727`），无 flag、无遥测；`resolveDmTurn` 拿不到任务列表无从校验。DM 拼错 id → 任务永不推进且无人知道。
4. **无活跃上限**：全库无 `MAX_ACTIVE_TASKS`；开局 `createStageOneStarterTasks()`（`taskV2.ts:735-1078`）一次种入 12-13 条（初始可见 2 条，其余 hidden 链式解锁）。唯一上限是每回合 `MAX_NEW_TASKS_PER_TURN=3`（`resolveDmTurn.ts:37`）。
5. **时限装饰性**：`autoFailAfterGameHour` 是唯一游戏时钟口径过期机制（`applyAutoFailedTasks`，接线于 `useGameStore.ts:~2058`），但**全部内容无一设置**；`expiresAt` 仅展示；prompt 从未指示模型输出 deadline 格式；change_set 的 `time_pressure` 只进 `security_meta` 元数据。「机会·限时」卡纯装饰。
6. **完成检测全押 LLM**：completionDetector 死代码；`validateNarrative.ts:~604` 的 `task_mode_mismatch`（叙事称完成但无结构 delta）severity=low 仅遥测，不纠偏不补 delta。DM 不 emit `task_updates` 主线就永远卡死（实测推演：第 10 回合可能仍是开局两张卡）。
7. **四轴语义打架**：`status`(5) / `grantState`(6) / 死代码 `QuestState`(7) / `surfaceClass`+派生 `TaskVisibilityTier`（`taskVisibilityPolicy.ts:36-61`，混用两轴+`FORMAL_TASK_BOARD_WHITELIST` 硬编码白名单）。「系统在追踪/玩家已知/已接取/上板」无单一事实源。
8. **迁移裸透传**：`migratePersistedState`（`useGameStore.ts:~242`）对根级 `tasks` 走 `...raw` 原样透传不做规范化（本次授权不管兼容，但需保证不崩）。
9. **结算无视任务**：`src/lib/settlement/rules.ts` 零 task 引用；结算页只把未完成任务当「重玩钩子」展示。任务完成度对结局毫无影响。
10. **世界引擎不推进任务**：`worldEngine/agenda.ts` 零 task 引用；任务演进 100% 绑在前台回合。
11. **命名碰撞**：`src/lib/ai/tasks/`（AI 路由「逻辑任务」）与 `src/lib/tasks/`（游戏任务）同名——重构检索时严防误伤，**`src/lib/ai/tasks` 不属于本次范围**。

耦合真实性：原石/物品奖励、NPC 关系后果（完成 trust+3 等，`taskConsequences.ts`）、`worldConsequences` 链式解锁（`activateClaimableHiddenTasks`）都是**真的**；时间/时限、理智、危险（第十日）与任务**无机制耦合**，只有文案呼应。

### 3.3 感知层缺陷（按玩家旅程）

- **断点 1**：开局两张卡在任何 NPC 开口前就已是「进行中」——玩家会问「我什么时候接的？」
- **断点 2**：任务 tab **无红点/badge**（`MobileBottomNav.tsx` 只给图鉴 tab 传 `badge`）；无 onboarding 引导，玩家可能整局不知道任务面板存在。
- **断点 3**：新任务出现**无推送**——高亮环 `recentTaskHighlightIds` 只在玩家已停留在面板时 5 秒消退（`page.tsx:~1086`）；toast 是 best-effort（仅当 DM 恰好吐 hint）；`auto_open_panel==="task"` 在 `narrativeFeatureTriggers.ts:181-187` 解析了但 **page.tsx 无任何接线**。
- **断点 4**：desc 说「至少两条碎片」但 UI 无 0/2 计数、无目标清单、无进度条；`requiredItemIds` 只在废弃函数里输出一句泛化文案。
- **断点 5**：无独立详情页，卡片手风琴展开即全部；「接取」按钮仅 `available+manual` 出现。
- UI 链路：`MobileBottomNav` → `MobileTaskPanel` → `PlayNarrativeTaskBoard`（1+2+1 舞台卡，434 行）→ 视图模型 `src/lib/play/taskBoardUi.ts`。文档里的 `PlayTaskPanel.tsx` 已不存在（docs 漂移一代）。
- **e2e 零覆盖**：28 个 spec 无任务专属；`mobile-reading-ui.spec.ts` 只断言旧任务入口已删除。

### 3.4 人机味来源确诊

- **Prompt 只有负向禁令**：`playerChatSystemPrompt.ts` line ~135「【任务文案（强制）】…禁止套用『帮我找到/调查一下』等通用模板句…」——无正例、无 few-shot、无字数结构约束；**compact 快车道（`buildCompactStablePlayerDmSystemLines`，~199-209）连这条禁令都没有**。
- **零校验链路**：`normalizePlayerDmJson.ts:~241` 对 new_tasks/task_updates 仅 `asUnknownArray` 透传；`normalizeGameTaskDraft` 只查 title 非空（`taskV2.ts:~380`），title/desc 连长度 clamp 都没有（其他字段都有）；`styleValidator` 只吃 `narrative`；`scrubTaskUiSurfacePhrases` 只改 narrative。**任务文案是 turn engine 里唯一没有 lint 的玩家可见文本**。
- **兜底句逐字循环**：`taskBoardUi.ts:~395-440` 按角色+id 哈希取硬编码句（mainline 2 句 flavor/2 句 nextStep、opportunity 1 句）；`taskPlayerFacingText.ts:~43-81` 的 at-a-glance 与 pressure nudge 同类任务逐字复用。
- **好文案存在但运行时享受不到**：手写 starter 与 `contentSpec/packs/baseApartmentPack.ts` 的文案质量不错（有 playerHook/urgencyReason/taboo）；但 drama packet 只对 6 个高魅力 NPC 有模板（`taskIssuerStyles.ts`），运行时 AI 生成的任务这些字段基本为空 → 落到兜底句。
- **可复用 lint 基建**：`styleValidator` 的 issue/report 形状、`styleBible.ts:64-90` 禁语库（已含「任务面板腔」）、`validateNarrative.ts:~629` 的接线范式、`resolveDmTurn` 的 `consistency_flags` 先例（`new_tasks_capped`）——加一个 `taskCopyValidator` 的地基全是现成的。
- 节奏机制现状：`npcProactiveGrant`（好感/地点/冷却三重门）是主要反轰炸闸；StoryDirector `stalled` 信号触发压力事件；**无任务荒补给下限机制**。

---

## 4. 目标产品设计（北极星）

Phase 1 你要写正式设计文档 `docs/task-system/DESIGN.md` 把以下骨架落成可实施规格（含数值、类型、UI 信息架构）：

### 4.1 引擎：单一状态机上电

- **一个状态机成为唯一裁决点**：复用或重写 `taskStateMachine.ts`（你决策，记录理由），接入生产路径——所有 status 变更（store 三动作、DM task_updates、auto-fail、claim 按钮）必须过 `canTransition` 守卫；非法转移拒绝 + `consistency_flags`（如 `task_illegal_transition_blocked`）+ 遥测。**终态锁**：completed/failed 不可逆；addTask 同 id 合并不得改写终态。
- **四轴收敛**：`status`（状态机唯一事实源）+ 派生展示层（可见性/板位由纯函数从 status+grantState 派生，白名单硬编码消灭）；死 `QuestState` 与生效枚举二选一统一；决策写进 DESIGN.md。
- **完成检测双通道**：结构化 `task_updates` 优先；completionDetector 上电作叙事兜底（高置信才自动推进，必附 flag+遥测）；`task_mode_mismatch` 从纯遥测升级为可修复动作（补 delta 或提示 DM 下回合收口）。
- **未知 id 防护**：task_updates 引用不存在的 id → flag `task_update_unknown_id` + 遥测 + （可选）模糊匹配建议。
- **上限与节奏**：活跃正式任务上限（DESIGN 定数值，建议 5-7）；超限时新任务降级为线索/软线；任务荒补给机制（连续 N 回合无可推进目标 → 导演信号强制发钩子）。
- **时限真实化**：定义 deadline 结构化格式（对齐游戏时钟 hourIndex）→ prompt 指示输出 → starter 内容填充 → `autoFailAfterGameHour` 真实生效 → 失败后果可感知。机会类任务 100% 带真实时限。

### 4.2 感知层：玩家永远知道发生了什么

任务 tab 红点 badge（新任务/有更新，语义对齐图鉴 tab 现有模式）；`auto_open_panel:"task"` 接线（正式托付镜头 → 自动切任务面板 + 高亮）；新任务/进度/完成/失败/临期五类事件的即时通知（toast 保底 + 面板内高亮跨回合保留至查看）；进度可视化（目标清单勾选或 x/y 计数，接 `requiredItemIds` 与线索）；卡片详情完整六要素（谁委托/为何要紧/下一步/奖励/风险/时限倒计时）；空状态与 onboarding 引导。三视口（390x844/393x852/430x932）截图验收。

### 4.3 玩法循环：接取有意义、失败有代价、完成有回响

available→active 的接取语义修正（断点 1：正式任务须经叙事授予才上板）；失败/超时后果落到关系与世界（已有 `taskConsequences` 骨架，补失败可感知呈现）；任务链 foreshadow→payoff（`followupSeedCodes`/`hiddenTriggerConditions` 链真实可达性审计——确保无永不满足的触发条件）；**结算接入任务完成度**（`settlement/rules.ts` 增加任务维度，DESIGN 定权重，结算页展示任务成就）；与危险/理智的耦合按 DESIGN 决策（至少：临期任务加压力文案与导演信号）。

### 4.4 文案人味宪法（写进 DESIGN.md 并全链路执行）

- **正向规范**：title ≤12 字、有具体名词与钩子、禁抽象套话；desc 三拍（现状一句 + 要做什么 + 为什么是现在）；nextHint 必须可执行（人/地/物至少其一）；语气贴 issuer 身份（复用 drama 字段）。
- **禁令清单**（写进 prompt 与 lint 双侧）：「帮我找到/调查一下/了解更多/揭开…的真相/看似…实则…/一探究竟/收集更多信息」等万能句；内部标签码泄漏（visited:/talked_to:/guidanceLevel）。
- **few-shot**：stable prompt 加 ≥4 组好/坏对照示例（好例直接从手写 starter 提炼）；**compact 快车道同步加约束**（治 3.4 第一条）。
- **`taskCopyValidator` 确定性 lint**：复用 styleValidator/styleBible 骨架，接线 `resolveDmTurn` 归一处（命中 → flag + 遥测；严重时降级该任务为线索）+ `scrubTaskTitleTemplates` 确定性软替换。
- **运行时字段回填**：AI 任务缺 playerHook/urgencyReason 时按 issuerId 从 drama/issuer 模板回填，不再落到全局兜底句。
- **内容重写**：12-13 条 starter 全部重写打磨过 lint；兜底句库按 issuer/任务类型分桶扩容 ≥3 倍，消灭逐字循环；contentSpec 与 starter 双源去重对齐。

---

## 5. 分阶段执行计划

每 Phase 收尾：跑该阶段验证 → 更新 `docs/task-system/PROGRESS.md` → 按 §2.2 pathspec commit。

- **Phase 0 · 基线实测与核查**（主线程）：`git status` 快照；起 mock server（**端口 3210**）真实走 10 回合观察任务体验并截图留档 `docs/task-system/screenshots/baseline/`；抽查复核 §3 关键事实；产出 `AUDIT-2026-07.md` + `PROGRESS.md`。
- **Phase 1 · 设计定案**（主线程）：写 `DESIGN.md`——状态机方案（复用死代码 or 重写）、四轴收敛、上限/节奏/时限数值、deadline 格式、结算权重、通知规则、UI 信息架构、文案宪法全文、类型变更清单。这是后续所有 agent 的契约文件。
- **Phase 2 · 引擎上电**（主线程或单 agent）：状态机接管全部转移 + 终态锁 + 未知 id 防护 + 上限 + auto-fail 生效 + completionDetector 上电 + 全部 flags/遥测；`questSystem.test.ts` 重写为对生产路径的测试（消灭虚假信心）；死代码要么上电要么删除，不留中间态。
- **Phase 3 · store 与存档安全**：store 三动作过状态机；持久化版本 bump；旧存档不可映射时的安全重置路径（fixture 构造旧形状存档验证不崩）；`finalizeTaskMutation` 链保持幂等。
- **Phase 4 · 感知层 UI**（可与 Phase 5 并行，文件领地无交集）：§4.2 全项；任务专属 e2e spec；三视口截图到 `screenshots/after/`。
- **Phase 5 · prompt 与 lint**（可与 Phase 4 并行）：few-shot 进 stable+compact prompt（检查 stable prompt version 兼容）；`taskCopyValidator` + scrub + 接线 + 单测（含 must-fail 反例）；deadline 输出指令；运行时字段回填。
- **Phase 6 · 内容重写**（**并行 fan-out ×3**，按 issuer/楼层分工，charter 见附录 A）：starter 全量重写、兜底句库分桶扩容、contentSpec 对齐去重；每条过 lint + 交叉互审。
- **Phase 7 · 系统耦合**：结算接入任务完成度；任务荒补给（导演信号）；链可达性审计脚本（扫描所有 `hiddenTriggerConditions` 是否存在生产者）；临期压力接导演。
- **Phase 8 · 可玩性验收**：mock 20 回合脚本化验收剧本（见 §8.2）；live playtest ≥3 会话×15 回合（真实模型），产出定性报告 + 生成任务文案 lint 抽样统计。
- **Phase 9 · 文档与终报**：过时 docs 四篇（task-ui-stage-v1 等）标注已推翻或重写；CLAUDE.md 任务相关行更新；`HANDOFF-to-eval.md` 定稿；全量验证；终报告。

---

## 6. Live 模型调用预算

- 前置 `pnpm verify:ai-gateway`；失败则 live 项标注跳过，mock 部分照常完成。
- playtest：每批次 ≤3 会话×15 回合；文案辅助生成（起草兜底句/few-shot 候选，你终审 + lint 后才入库）≤500 次/日；**单日总调用 ≤2000 次**，超限停 live 记录在案。
- 密钥只经现有 env 机制；不打印。

---

## 7. 多 Agent 编排纪律

与 eval 会话提示词同款：你是 orchestrator，规划/整合/验证/commit 只在主线程；fan-out 前先落 DESIGN.md 契约；并发 ≤4；探索用 Explore、实现用 general-purpose；两个 agent 永不写同一文件；子 agent 产出必须落盘；汇合后主线程跑 `npx eslint .` + `pnpm exec tsc --noEmit` + 相关单测全绿才 commit；子 agent 不碰 git。长上下文防护：结论及时写入 PROGRESS/AUDIT/DESIGN，文件是唯一跨阶段记忆。

---

## 8. 验证矩阵与完成定义

### 8.1 日常验证矩阵

| 改动 | 最低验证 |
|---|---|
| 状态机/纯函数/lint | `pnpm dlx tsx --test <相关.test.ts>` |
| store/持久化 | 相关单测 + 旧存档 fixture 加载不崩 |
| DM JSON 字段链路 | `pnpm dlx tsx --test src/features/play/turnCommit/resolveDmTurn.test.ts` + `pnpm test:e2e:chat` |
| prompt 改动 | `pnpm test:promptfoo`（若被 eval 会话改挂，先判断归属）+ 相关快照/单测 |
| UI | `npx eslint .` + 任务 e2e spec + 截图 |
| 类型密集 | `pnpm exec tsc --noEmit` |

### 8.2 可玩性验收剧本（mock，20 回合，必须全绿）

脚本化会话依次断言：开局仅授予语义正确的任务可见 → 新任务出现时红点+通知可感 → 接取语义正确 → 进度推进 UI 有 x/y 变化 → 时限任务临期有压力呈现、超时自动 failed 且后果落账 → 完成时 toast+奖励+关系后果+链式解锁 → DM 尝试复活已完成任务被拦截并 flag → task_updates 未知 id 被 flag → 单回合 >3 new_tasks 被 cap → 结算页体现任务完成度。以任务专属 e2e + 单测组合实现。

### 8.3 完成定义（全部满足才算完成）

- [ ] 状态机接管生产路径，非法转移矩阵单测全绿；终态锁生效（复活攻击被拦截 + flag + 遥测）
- [ ] 未知 id 防护、活跃上限、任务荒补给、auto-fail 时限全部真实生效且有测试
- [ ] completionDetector 上电（或等价机制），DM 不 emit 时主线不再死锁；`task_mode_mismatch` 有修复动作
- [ ] 四轴语义收敛并写入 DESIGN.md；死代码零残留（上电或删除），`questSystem.test.ts` 对齐生产
- [ ] 感知层：红点、auto_open 接线、五类事件通知、进度可视、详情六要素、空态引导全部落地；三视口截图前后对比留档
- [ ] 任务专属 e2e ≥1 spec 进仓库并通过；可玩性验收剧本（8.2）全绿
- [ ] 文案：starter 全量重写过 lint 零违例；`taskCopyValidator` 接线含 must-fail 反例；few-shot 进 stable+compact prompt；live 抽样 ≥30 条生成任务 lint 通过率 ≥90%；兜底句分桶扩容 ≥3 倍
- [ ] 结算接入任务完成度；链可达性审计零孤儿
- [ ] 旧存档加载不崩（安全重置路径有 fixture 测试）
- [ ] live playtest ≥3×15 回合报告（`docs/task-system/PLAYTEST.md`）
- [ ] `HANDOFF-to-eval.md` 交付（新增不变量清单、建议评测 case、mock 任务场景需求、rubric 维度建议）
- [ ] 全量：`npx eslint "src/**/*.{ts,tsx}" "e2e/**/*.ts"` + `pnpm exec tsc --noEmit` + `pnpm test:unit` + `pnpm test:e2e:chat` + `pnpm test:e2e:contract` + `pnpm build` 全绿（若因 eval 会话并行改动导致失败，判断归属：自己的修，对方的在 PROGRESS 记录不阻塞）
- [ ] 文档更新（过时四篇处置 + CLAUDE.md）；无 TODO、无伪代码、无半成品

---

## 9. 长程执行协议

- TodoWrite 全程维护；`docs/task-system/PROGRESS.md` 是断点续跑唯一事实源（phase/done/next/blockers/facts-learned/最近 commit sha）。
- 启动第一步：`git status` + 查 `docs/task-system/PROGRESS.md` 是否存在——存在即续跑，从 next 继续。
- 同一问题连续 3 次失败 → 记 blocker + 绕行，不空转。不提前停止；不问「是否继续」；完成 §8.3 才收尾。
- 终报告用 CLAUDE.md §15 格式，额外附：基线截图 vs 终态截图对照、缺陷修复对照表（§3.2 逐条的处置结果）、live playtest 摘要、双会话冲突处理记录。

---

## 附录 A · 子 Agent Charter 模板

```text
【使命】一句话目标 + 完成判据
【必读】docs/task-system/DESIGN.md + docs/task-system/AUDIT-2026-07.md + <相关运行时文件>
【独占产出】<明确文件路径列表，只许写这些>
【禁区】不碰 git；不改 DESIGN 契约；不碰 §2.1 对方领地与共享文件（需要时报告主线程处理）；不新增依赖
【自验】<完成后必须跑通的命令>
【汇报】改动文件清单 / 自验结果 / 发现的问题（写入指定 findings 文件）
```

## 附录 B · 断点续跑提示词（新会话粘贴）

```text
继续执行 docs/prompts/task-system-overhaul-execution-prompt.md 定义的任务系统重构长程任务。
先读该提示词（重点 §2 双会话协作协议）与 docs/task-system/PROGRESS.md，
再 git status + git log --oneline -15 核对进度与并行改动，从 PROGRESS 的 next 继续。
遵守同一授权与硬红线，完成定义见 §8.3。不重做已完成阶段；不请求人工确认。
```

## 附录 C · 文件领地速查

```text
【独占】src/lib/tasks/**  src/lib/play/taskBoardUi.ts  src/lib/ui/taskPlayerFacingText.ts
        src/features/play/components/PlayNarrativeTaskBoard.tsx  src/features/play/mobileReading/(任务组件)
        src/lib/contentSpec/**  docs/task-system/**  e2e/(新任务 spec)
【共享·谨慎】useGameStore.ts  play/page.tsx  resolveDmTurn.ts  normalizePlayerDmJson.ts
        playerChatSystemPrompt.ts  runtimeContextPackets.ts  validateNarrative.ts
        computeStateDelta.ts  commitTurn.ts  narrativeStyle/**  CLAUDE.md
【对方领地·只读】scripts/eval-*  scripts/benchmark-*  src/lib/evals/**  benchmarks/**
        .github/workflows/ci.yml  docs/eval/**  src/lib/ai/mock/mockScenarios.ts
【无关·勿动】src/lib/ai/tasks/**（AI 路由，与游戏任务无关的同名目录）
```
