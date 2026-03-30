# 任务系统 / 任务 UI / 选项生成 / 世界观入口优化总方案（v1）

**定位**：VerseCraft 阶段 1（审计 + 落地方案定稿），随后进入代码修改阶段。  
**角色**：首席产品技术架构师 + 严苛叙事系统负责人。  
**硬约束**：不破坏现有 UI 框架、现有 JSON 契约、现有 SSE 形状、现有主游玩链路；不推翻重写，只做小步重构；每个问题必须指出真实代码位置；设置页不再承担任务主入口；系统知道有任务≠玩家应该看见任务；普通 NPC 不围着主角转；新手开局不被任务面板淹没；文本必须原创，不仿具体作品。

---

## 0. 结论先行（本次定稿的“可落地承诺”）

本次方案的核心，是把“任务”拆成 **玩家可理解的叙事层级**，并把“展示”拆成 **UI 入口与聚焦机制**：

- **展示入口**：任务主入口从“设置页内嵌任务板”迁出，设置页回归控制中枢（属性/武器/职业/音量/退出）。任务板只在“任务面板（右侧浮层）/独立入口按钮”出现。
- **授予原则**：**未在叙事中正式交到玩家手上的任务，不上任务板主视野**；最多以“线索/动向”形态进入手记（现有 `journalClues`）。
- **授予→聚焦**：当 NPC 正式交付任务，DM 输出 `ui_hints`（已存在）触发前端 **自动打开任务面板并高亮对应条目**（前端能力已就绪）。
- **选项生成修复**：把“选项再生成失败”拆成 **请求发出**、**SSE 折叠**、**JSON 解析**、**服务端 resolver 裁剪** 四段定位与补洞；方案在不改 SSE/JSON 的前提下保证“要么有 4 条选项，要么给出可操作的降级路径”。
- **世界观与新手主轴**：将“月初误闯学生”“空间权柄碎片闭环”作为**世界入口层**统一解释；将“老刘（生存/记账/工具）+ 麟泽（边界/锚点/不越界）”固化为**新手引导双核**，其余高魅力 NPC 按 reveal/layer 门闸逐步进入，不抢开局叙事焦点。

---

## 1. 真实根因拆解（任务系统 / 展示 / 设置页 / 选项生成 / 世界观体验）

### 1.1 设置页为什么“变成任务入口”（真实代码根因）

- **根因**：设置页 UI 容器（控制中枢）中 **直接嵌了任务板组件**，导致玩家形成“任务=设置的一部分”的错误认知路径。
- **代码位置**：`src/components/UnifiedMenuModal.tsx`
  - `SettingsPanel` props 包含 `tasks: GameTask[]`（设置页拿到了任务数据）。
  - `SettingsPanel` 内部直接渲染：
    - `PlayNarrativeTaskBoard`（嵌入式密度 `density="embedded"`），见该文件中 `SettingsPanel` JSX 片段：
      - `PlayNarrativeTaskBoard tasks={tasks} ... density="embedded"`.

### 1.2 “系统知道有任务”为什么≈“玩家立刻看到任务”（根因）

- **根因 A（状态层）**：客户端对 `tasks` 的默认装载与展示主要取决于 `status !== "hidden"`，而不是“是否在叙事中正式授予”。
  - `src/lib/play/taskBoardUi.ts`：`partitionTasksForBoard()` 只过滤 `status === "hidden"`，未把 `taskNarrativeLayer` 当成硬展示门槛。
  - `src/features/play/components/PlayNarrativeTaskBoard.tsx`：从 `filterTasksForTaskBoardVisibilityV2()` 进入分区，但该过滤只覆盖 `soft_lead && available` 的一个子集（见下）。
- **根因 B（展示层）**：任务板文案将 `available` 与“可接取”强绑定（`getTaskStatusLabel("available") -> "可接取"`），易误导玩家把“系统候选”理解为“NPC 已正式托付”。
  - `src/lib/tasks/taskV2.ts`：`getTaskStatusLabel()`
- **根因 C（开局密度）**：初始化任务可能直接 `active/available`，而新手尚未建立“世界入口→引导→线索→承诺→正式任务”的心理模型。
  - `src/store/useGameStore.ts`：`initCharacter()` 初始化 `tasks: createStageOneStarterTasks()`。
  - `src/lib/tasks/taskV2.ts`：`createStageOneStarterTasks()` 内含多条 `active/available` 样例任务，且部分 `claimMode` 为 `npc_grant/manual`，但并非每条都保证“叙事中出现授予镜头”。

### 1.3 任务分层能力“存在但没闭环”（根因）

项目其实已经具备分层字段与推断逻辑，但缺少“展示入口/授予门槛/聚焦反馈”的闭环。

- **分层字段存在**：
  - `src/lib/tasks/taskRoleModel.ts`：`TaskNarrativeLayerKind = soft_lead | conversation_promise | formal_task`，以及 `inferEffectiveNarrativeLayer()`。
  - `src/lib/tasks/taskV2.ts`：`taskNarrativeLayer`、`shouldStayAsSoftLead`、`shouldStayAsConversationPromise`、`shouldBeFormalTask`、`promiseBinding` 等字段。
- **UI 可见策略只做了半步**：
  - `src/lib/play/taskBoardUi.ts`：`filterTasksForTaskBoardVisibilityV2()` 仅做：
    - `layer === "soft_lead" && status === "available"` → 不上板
  - 但对 `soft_lead + active`、以及“未授予但被标记为 formal_task/available”的情形没有硬约束。
- **DM 侧“NPC 主动发放”守卫存在**（但仍以“系统下发任务对象”为中心）：
  - `src/lib/tasks/taskV2.ts`：`applyNpcProactiveGrantGuard()` 会按地点/冷却/好感/同 NPC 未关闭任务等拦截 `npc_grant` 任务。
  - 同文件 `buildNpcProactiveGrantNarrativeBlock()` 已明确“禁止写法：系统发放任务/你已接取任务”，但这只约束叙事口吻，不等价于“任务展示门槛”。

### 1.4 选项生成/重新生成为什么会失效（真实链路断点）

#### 前端：再生成请求已存在，但最终落地可能变成空

- **前端请求入口**：`src/app/play/page.tsx` 的 `requestFreshOptions()`：
  - 会向 `/api/chat` 发 `clientPurpose: "options_regen_only"`，并把用户消息写成 `OPTIONS_REGEN_SYSTEM_PROMPT + 原因`。
  - 会读取 SSE 全量文本、`foldSseTextToDmRaw()`、优先 `tryParseDM()`，若解析不到完整 DM shape，则用 `extractRegenOptionsFromRaw()` 去扫描 `{"options":[...]}`。
  - 最终 `normalizeRegeneratedOptions()` 后写回 `setCurrentOptions()`。
- **失败表现**（你描述的“点重新生成也生成不出来”）在前端可能来自三类真实条件：
  1) **服务端回了非 200 或无 body** → 前端直接提示失败（`if (!res.ok || !res.body)`）。
  2) **SSE 返回了内容，但解析不到 options**：
     - 模型输出含多段对象/协议污染/无 braces → `extractRegenOptionsFromRaw()` 返回 null。
  3) **拿到了 options，但被前端归一化裁掉**：
     - `normalizeRegeneratedOptions(rawOpts, [])` 若判定重复/脏文本/非第一人称可执行短句，可能清空。

#### 服务端：专门为 options-only 做了“跳过补救”的逻辑，存在误配空间

- **服务端识别 clientPurpose**：`src/app/api/chat/route.ts`
  - `clientPurpose === "options_regen_only"` 时，会保护入参（不被 rewrite/fallback 覆盖）。
  - 但在最终 `final_hooks` 阶段有一处关键逻辑：
    - `shouldSkipRegen = validated.clientPurpose === "options_regen_only"` → **后置补选项逻辑会跳过**（这是正确的：options-only 不应再被“普通回合补选项”覆盖）。
  - 这意味着：**options_regen_only 的成功率完全依赖“options-only 子任务本身能生成 + 最终 resolver 不裁掉”**。一旦该子任务输出形态不稳定或被裁剪，前端就会空。

#### 结论：失败不是“一个 bug”，是“缺少强保证”

当前链路的设计是“尽力生成 options；不行就空并提示切换手动输入”。这在工程上合理，但在产品上会被玩家体验为“按钮坏了”。

本方案要求：**按钮必须可被信任**。因此将引入“可观测 + 可解释的失败原因 + 更强的可选行动兜底”，但不改 SSE/JSON 形状。

### 1.5 为什么老刘与麟泽没成为真正新手主轴（根因）

- **根因 A（入口位置不够硬）**：新手的注意力被“设置页里的任务板 + 多分区卡片”稀释，双核主轴无法形成“先遇到谁、为何信谁、该跟谁学什么”的明确路径。
  - `src/components/UnifiedMenuModal.tsx`：设置页内嵌任务板（分散注意力）。
  - `src/features/play/components/PlayTaskPanel.tsx`：任务面板标题与副标题已经偏“待办”，对新手来说像工具，不像“谁在托付我”。
- **根因 B（任务排序主线压扁人物）**：
  - `src/lib/play/taskBoardUi.ts`：`pickPrimaryTask()` 主线绝对优先（`inferObjectiveKind === "main"` 优先），人物引导难长期占主视野。
- **根因 C（任务授予缺“NPC镜头→UI反馈”闭环）**：
  - 前端虽支持 `ui_hints.auto_open_panel + highlight_task_ids`（`src/app/play/page.tsx`），但服务端/DM 并未把“正式授予”稳定映射成这套 hints（需要产品/任务状态机补上）。

### 1.6 为什么世界设定很多但真实感不强（根因）

真实感不是“设定量”，是“玩家每回合能验证的因果链”。

- **因果链缺口**：
  - 任务/线索/承诺/正式任务之间没有强制“升格仪式”：
    - `taskRoleModel.ts` 已有层级，但 UI/授予门槛不足。
  - 图鉴把长 lore 直接推给玩家：
    - `src/lib/registry/codexDisplay.ts` 的 `buildCodexIntro()` 会把 `NPCS.find(...).lore` 拼进玩家可见介绍（例如夜读老人条目 `npcs.ts` 的 lore 很容易在早期造成剧透/全知感）。
  - runtime packets 中存在“系统字段名”提示（例如职业 hints），模型可能学舌进入 narrative（破坏真实感）：
    - `src/lib/playRealtime/runtimeContextPackets.ts` 的 `buildProfessionSystemHints()` 会输出含 `main_threat_updates` 等机制词。

---

## 2. 为什么“设置里显示任务”会伤害认知（产品 + 叙事双重）

### 2.1 产品认知伤害

- **设置是控制中枢**：玩家预期“这里是我自己能控制的东西”（属性、装备、音量、退出），不是“世界在对我发出托付/风险”。
- **任务是承诺与后果**：任务的本质是“与世界/他人达成一笔债”，它应该在“叙事现场 + 任务面板”建立，而不是被塞进“设置”。

### 2.2 叙事伤害

任务板一旦进入设置页，玩家会把任务当成“系统列表”，而不是“NPC 的话留下来的钩子”。这直接削弱：

- NPC 的主动性与人格差异（变成统一的任务卡）。
- 托付的仪式感（变成 UI 自己冒出来的项目）。
- 世界真实感（像是系统在投喂而不是人在说话）。

### 2.3 真实代码对应（必须点名）

`src/components/UnifiedMenuModal.tsx` 的 `SettingsPanel` 当前包含：

- 属性面板 + 职业 + 武器 + 音量 + 退出（合理）
- **以及** `PlayNarrativeTaskBoard`（不合理，需迁出）

---

## 3. 为什么“未正式授予也展示任务”会让玩家一头雾水（真实机制冲突）

### 3.1 玩家视角的“疑问爆炸”

当任务卡出现，但叙事里没出现“谁托付我/我答应了什么/代价是什么”，玩家只能问：

- 我什么时候接的？
- 为什么是我？
- 我现在到底要做什么？
- 这是不是系统教程？

这些疑问会吞掉“悬疑留白”的空间，把留白变成“信息缺失的 bug 感”。

### 3.2 系统视角的“状态与体验不一致”

任务系统层把任务当“结构化对象”（`new_tasks`、`task_updates`），UI 把它当“可展示卡片”。缺少一个强约束：**必须先在 narrative 里可见授予瞬间**，再允许任务进入可展示集合。

### 3.3 真实代码对应

- `src/lib/play/taskBoardUi.ts` 的 `partitionTasksForBoard()` 主要基于 `status`，不是基于“授予镜头”。
- `src/lib/tasks/taskV2.ts` 的 `normalizeGameTaskDraft()` 与 `normalizeDmTaskPayload()` 会把 `new_tasks` 归一化后写回客户端；这一步没有“必须 surfaced_in_narrative 才能展示”的门槛字段。

---

## 4. 为什么当前选项生成 / 重生会失效（拆成 4 段可定位问题）

### 4.1 段 1：请求未发出或被前端阶段锁挡住

- `src/app/play/page.tsx`：
  - `doesPhaseBlockOptionsRegen(streamPhase)`、`sendActionInFlightRef`、`endgameState`、`isGuestDialogueExhausted` 都会阻止再生成。
  - 这类阻止是正确的，但需要产品提示“为什么不能刷”（否则玩家以为按钮坏了）。

### 4.2 段 2：服务端正常回 SSE，但 options-only 输出形态不稳定

- options-only 允许输出 `{"options":[...]}`（不含完整 DM 形态）。
  - 前端已用 `extractRegenOptionsFromRaw()` 兜底抽取（`src/features/play/stream/dmParse.ts`）。
  - 但若输出含协议污染/没有平衡花括号/被安全审核改写成别的形态，抽取会失败。

### 4.3 段 3：resolver/安全门闸裁剪导致 options 被清空

服务端最终会 `resolveDmTurn(dmRecord)`（`src/app/api/chat/route.ts`），其中可能对 options 做去重/裁剪/默认处理（由 `resolveDmTurn` 实现决定）。即使模型输出过 options，也可能被裁成不足 2 条甚至 0 条。

### 4.4 段 4：前端归一化再次裁剪

`normalizeRegeneratedOptions()` + `sanitizeDisplayedOptionText()` 会对长度、重复、无效内容进一步裁剪（`src/app/play/page.tsx` 与 `sanitizeDisplayedNarrative.ts`/`sanitizeDisplayedOptionText`）。

---

## 5. 为什么“老刘与麟泽”没有成为真正的新手引导主轴（产品结构缺位）

### 5.1 已有资产（证明可落地）

项目已经有把双核写进世界与 prompt 的基础设施：

- 老刘（N-008）：
  - `src/lib/registry/world.ts` `NPC_SOCIAL_GRAPH["N-008"].new_tenant_guidance_script` 已存在“记账/别逞能”的引导台词脚本。
  - `src/lib/tasks/taskV2.ts` 的 starter tasks 里有多条以老刘为 issuer 的骨架任务（如 `main_escape_route_fragments`、`main_b1_orientation`）。
- 麟泽（N-015）：
  - `src/lib/registry/majorNpcDeepCanon.ts` 为 N-015 定义了 `naturalContactChain`、`partyRelinkConditions`（强调边界、互证、非立即并队）。
  - `src/lib/registry/npcProfiles.ts` N-015 也明确了 `questHooks`（如 `anchor.oath.b1`、`border.watch.log`）。

### 5.2 缺口（必须补）

- **缺一个“新手引导层”**：当前 UI 与任务板没有把“先学会在 B1 活下来”独立成主轴入口（反而被设置页任务板稀释）。
- **缺“授予→聚焦”**：老刘/麟泽说出一句关键托付时，任务面板没有必然打开、高亮；玩家错过一次，就失去抓手。

---

## 6. 为什么当前世界虽然有设定，但玩家真实感未必强（体验结构缺位）

真实感来自三件事：

1) **入口解释统一**：玩家知道“我为什么在这”（月初误入、空间权柄渗漏）——不是谜语堆叠。
2) **可验证的交换**：NPC 的托付能落盘，落盘后能回收（完成/失败/代价）。
3) **可复述的因果**：玩家能用一句话复述“我欠谁什么/我为什么要做/我下一步去哪”。

当前缺口集中在“线索/承诺/正式任务”的升格仪式与 UI 回响不足，而不是设定不够。

---

## 7. 新的产品分层（定稿）

本分层将成为接下来所有改动的判定标准（谁能进任务板、谁只能进手记、何时聚焦 UI）。

### 7.1 世界入口层（World Entry）

- **目标**：统一解释“学校泡层/公寓泡层”同源于“空间权柄碎片”渗漏；强调“月初误闯学生”是群体事件。
- **承载**：
  - runtime packet：`src/lib/playRealtime/runtimeContextPackets.ts` 已有 `player_world_entry_packet` 与 `space_authority_baseline_packet`（由 rollout 控制）。
  - 文案：固定开场与普通 NPC 常识台词（后续 P0/P1 改）。

### 7.2 新手引导层（Dual-core Onboarding）

- **双核**：
  - 老刘：生存/工具/记账/后勤节奏
  - 麟泽：边界/锚点/不越界/互证
- **原则**：不把他们写成“系统教程”，而是“你不这样做就会死”的现实劝阻。
- **承载**：
  - `world.ts` 的 `new_tenant_guidance_script`（老刘）强化口径
  - 任务授予必须走叙事镜头 + UI 聚焦（后续 P2）

### 7.3 线索层（Clue）

- **形态**：手记线索（`journalClues`），带“可疑点/传闻/未证实信息”。
- **代码承载**：
  - `src/lib/domain/narrativeDomain`（clue 结构）
  - `src/store/useGameStore.ts`：`mergeJournalClueUpdates()`
- **展示**：不占任务板主列表；作为“动向/沾边的”辅助信息。

### 7.4 承诺层（Conversation Promise）

- **定义**：玩家在叙事中明确答应某人/某事（不是系统下发）。
- **结构化锚**：
  - `taskV2.ts` 的 `promiseBinding`（含 npcId、utteranceRef 等）。
  - `taskRoleModel.ts` 会将 promise 归为 `conversation_promise`。
- **展示**：在任务板的“约定·托付·险情”带出现，但文案必须强调“我答应过谁”，而不是“可接取”。

### 7.5 正式任务层（Formal Task）

- **定义**：NPC 明确托付/交割条件/风险与回报，且 narrative 中可复述。
- **展示**：才允许进入“正在推进/还能试的方向”。
- **授予门槛（定稿）**：未在叙事中正式授予 → 不进入该层（见 §8 实施）。

### 7.6 UI 展示层（UI Entrances & Focus）

- **入口**：
  - 任务面板：`src/features/play/components/PlayTaskPanel.tsx`（overlay）
  - 设置页：回归控制中枢，移除嵌入任务板（`UnifiedMenuModal.tsx`）
- **聚焦**：
  - `src/app/play/page.tsx` 已支持：
    - `ui_hints.auto_open_panel === "task"` → `setIsTaskPanelOpen(true)`
    - `ui_hints.highlight_task_ids` → 高亮并定时清空

### 7.7 选项生成层（Options Pipeline）

把 options 视为“每回合可执行动作的最小闭环”，其可靠性优先级高于“文采”。

- **前端**：`requestFreshOptions()` 作为 “options-only 请求器”
- **服务端**：
  - `clientPurpose: "options_regen_only"` 的专用路径
  - 明确的失败原因回写（仍用同一 SSE/JSON，不新增协议字段：可复用 `ui_hints.toast_hint`）

---

## 8. 分阶段实施计划（定稿）

> 不改 UI 视觉风格；不大改无关模块；每一步都可回滚。

### P0（必须先做，解决最痛点）

- **设置页移除任务展示**
  - 改动点：`src/components/UnifiedMenuModal.tsx`：`SettingsPanel` 去除 `PlayNarrativeTaskBoard` 区块；并删除 `tasks`/`journalClues`/`codex` 等不再需要的 props 传递（保留控制中枢本职）。
- **任务板展示兜底：禁止裸 `N-xxx`**
  - 改动点：`src/features/play/components/PlayNarrativeTaskBoard.tsx` 与 `src/lib/ui/displayNameResolvers.ts`：当 codex 缺失时也不显示内部 id（优先 registry 名或泛称）。
- **夜读老人/高魅力 lore 玩家侧去剧透**
  - 改动点：`src/lib/registry/npcs.ts` 与/或 `src/lib/registry/codexDisplay.ts`：把玩家可见 lore 改为“职能壳+违和感”，深层词汇进入 DM-only 或 reveal 门闸。
- **选项再生成可靠性：失败原因可解释**
  - 改动点：`src/app/play/page.tsx` + `src/app/api/chat/route.ts`：对 options_regen_only 返回“无 options”的具体原因填入 `ui_hints.toast_hint`（前端已会展示 hint），至少区分：请求被锁/解析失败/被裁剪/上游拒绝。

### P1（世界入口与双核主轴强化）

- **世界入口一句话锚点**：在不扩协议的前提下，让“空间权柄碎片”与“月初误闯学生”成为可复述常识（固定开场 + 普通 NPC 台词 + worldview packet 一句短锚）。
- **老刘/麟泽引导台词强化**：保持口语化张力、短狠句，避免教程清单；强化“你只是又一批”与“先活下来”的现实阻力。

### P2（任务“叙事授予→上板→聚焦”闭环）

- **授予门槛**（服务端/状态机）：
  - 未在 narrative 中出现“托付/条件/风险/回报”的任务 → 强制 `hidden` 或降级为 clue（soft lead）。
  - NPC 正式授予时 → 必写 `ui_hints.auto_open_panel="task"` + `highlight_task_ids=[...]`（前端已支持）。
- **展示文案分层**：把 “available=可接取” 的默认标签改为更接近日常认知的“有人提起/有人要你答应/有人要你做一件事”，并只在 formal_task 才出现“接取/推进”按钮。

### P3（可玩性/真实感增强：关系与世界反馈）

- **关系可感知化**：在不新增复杂 UI 的前提下，为图鉴与任务卡补“传闻短句/张力短句”（匿名化，不暴露内部 id）。
- **空间权柄碎片闭环玩法**：将“碎片”落为可交易、可欠条、可验证的物证链（北夏/欣蓝/麟泽各承担不同功能位），使玩家能用行动推动世界规则显形，而不是被动听设定。

---

## 9. 每阶段验收标准（定稿）

### P0 验收

- 设置页只剩：属性/武器/职业/音量/退出（以及与控制中枢强相关内容），**不出现任务板**。
- 任务板任何位置 **不出现裸 `N-xxx`**（codex 缺失也不出现）。
- 夜读老人图鉴简介中 **不出现“消化日志”等深层答案词**（只保留违和感与禁忌）。
- “重新整理选项”按钮：
  - 要么生成 4 条；
  - 要么明确提示“为什么失败、下一步怎么办”（例如切换手动输入/稍后再试/当前被锁）。

### P1 验收

- 新开局 3 次、随机走 5 回合：
  - 普通 NPC 不写成默认旧识；
  - 新手能复述“我为什么在这/我不是唯一/我要先学什么”。

### P2 验收

- 抽 20 回合：
  - 任务板出现的每条“正式任务”，都能在日志中找到对应的“NPC 托付镜头”（可复述）。
  - 当任务被正式托付时，任务面板自动打开并高亮对应条目（`ui_hints` 驱动）。

### P3 验收

- 玩家无需看 registry，即可说出至少两条“谁怕谁/谁欠谁/谁在试探我”的关系张力，并能用行动验证或推翻。

---

## 10. 风险与回滚策略（定稿）

### 10.1 风险

- **R1：任务展示过严导致“板上空”**  
  - 解决：允许“承诺层”与“线索层”在任务板保留小入口（非主列表）；同时提供“去手记看动向”的提示。
- **R2：选项再生成过强兜底导致出戏**  
  - 解决：兜底只在 `options_regen_only` 里工作；输出严格为第一人称短行动句，避免机制词。
- **R3：图鉴去剧透导致“信息不够”**  
  - 解决：把深层信息迁移到 reveal 门闸后（packet/deep），而不是删除；保证随进度逐步可得。
- **R4：迁出设置页后玩家找不到任务**  
  - 解决：保留明显的任务按钮入口（不改视觉风格，只调整位置与交互）；NPC 正式授予时自动打开任务面板建立认知。

### 10.2 回滚策略

- 每个 P0/P1/P2/P3 改动都以“单文件小步”为单位提交，可通过 git revert 逐项回滚。
- 现有 rollout flags 已覆盖任务可见策略（`NEXT_PUBLIC_VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2` 等，见 `docs/world-entry-ui-task-commit-rollout-v3.md`），可在紧急情况下回到旧可见逻辑。

---

## 附录：本次审计引用的关键代码锚点（便于定位）

- 设置页嵌入任务板：`src/components/UnifiedMenuModal.tsx` → `SettingsPanel` → `PlayNarrativeTaskBoard`
- 任务面板（overlay）：`src/features/play/components/PlayTaskPanel.tsx`
- 任务板渲染：`src/features/play/components/PlayNarrativeTaskBoard.tsx`
- 任务板分区与可见策略：`src/lib/play/taskBoardUi.ts`
- 任务 schema/归一化/主动发放守卫：`src/lib/tasks/taskV2.ts`
- 任务分层推断：`src/lib/tasks/taskRoleModel.ts`
- 委托人模板：`src/lib/tasks/taskIssuerStyles.ts`
- 图鉴展示与名字兜底：`src/lib/registry/codexDisplay.ts`、`src/lib/ui/displayNameResolvers.ts`
- 世界与 NPC 注册表：`src/lib/registry/world.ts`、`src/lib/registry/npcs.ts`、`src/lib/registry/npcProfiles.ts`、`src/lib/registry/majorNpcDeepCanon.ts`
- options-only 再生成请求：`src/app/play/page.tsx` `requestFreshOptions()`
- options-only 解析兜底：`src/features/play/stream/dmParse.ts` `extractRegenOptionsFromRaw()`
- 服务端 chat 路由与 clientPurpose：`src/app/api/chat/route.ts`
- 任务授予→UI 聚焦能力：`src/app/play/page.tsx`（读取 `ui_hints.auto_open_panel/highlight_task_ids`）

