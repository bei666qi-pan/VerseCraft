# VerseCraft 任务系统重构 · 设计文档 (DESIGN.md)

> **版本**: v1
> **日期**: 2026-07-08
> **状态**: 设计定案，可实施

---

## 1. 状态机方案

### 1.1 决策

**复用现有死代码 `taskStateMachine.ts` 的核心逻辑，将其接线到生产路径。**

理由：
- `VALID_TRANSITIONS` 映射 + `canTransition` 纯函数 + 守卫模式是完全正确的设计
- 不引入新类型系统复杂性（现有守卫类型 `QuestGuardContext` 可用）
- 重写同样的逻辑是无意义的烧钱

### 1.2 修改策略

```
src/lib/tasks/taskStateMachine.ts
├── 保留: canTransition(), isTerminal(), QuestTransition, QuestTransitionResult
├── 保留: QuestGuardContext（扩展 gameHourIndex + activeTaskCount）
├── 新增: canTransitionStatus(from: GameTaskStatus, to: GameTaskStatus) — 将 QuestState 映射到 GameTaskStatus 版本
├── 新增: guardStatusTransition(task, toStatus, ctx) — 统一入口代替逐个 guard*
├── 移除: guardActivate, guardMarkDeliverable, guardComplete, guardFail, guardExpire（合并到统一入口）
├── 移除: QuestState 类型枚举（只保留内部映射函数）
├── 移除: taskStatusToQuestState / questStateToTaskStatus（不再需要交叉映射）
└── 保留导出: QuestGuardContext, QuestTransition, QuestTransitionResult
```

### 1.3 生成 / 生效状态的映射

`GameTaskStatus`（5 值）作为状态机唯一事实：

| status 枚举 | 状态机角色 | 可转移至 |
|---|---|---|
| `hidden` | 未满足前置条件，不可见 | `available`, `active`(auto 模式) |
| `available` | 可接取（叙事提出或 UI 可见） | `active`, `completed`(auto), `failed` |
| `active` | 进行中 | `completed`, `failed` |
| `completed` | 终态 | 无（不可逆） |
| `failed` | 终态 | 无（不可逆） |

合法转换矩阵：

```
hidden → available (trigger conditions met)
hidden → active (claimMode=auto + trigger conditions met)
available → active (player accepts / narrative takes effect)
available → completed (claimMode=auto, completion detector triggers)
available → failed (explicit DM task_updates)
active → completed (DM task_updates or completion detector)
active → failed (DM task_updates, auto-fail on timeout, explicit fail)
completed → ❌ (ANY)
failed → ❌ (ANY)
```

### 1.4 `deliverable` 和 `expired` 的处理

- **`deliverable`**（原 QuestState）：移除。active → completed 直接切换，reward 在 transition 时同步发放
- **`expired`**（原 QuestState）：移除。超时由 `autoFailAfterGameHour` 主动转移为 `failed`，携带 reason `"expired"`

---

## 2. 四轴收敛

### 2.1 收敛策略

| 轴 | 处理 | 原因 |
|---|---|---|
| `status` (5 值) | **保留**：状态机唯一事实源 | 核心字段，全链路消费 |
| `grantState` (6 值) | **移除**：不再作为存储字段 | 与 status 语义重叠，visibility 可由 status+surfaceClass 派生 |
| `QuestState` (7 值) | **删除**：整个类型和死代码引用 | 不再被任何生产路径引用 |
| `surfaceClass` (4 值) | **保留**：轻量内容作者提示 | 对 UI slotting 有价值，运行时从 status 可派生默认值 |

### 2.2 grantState 迁移路径

- **旧存档**：`grantState` 字段存在于存储的 `GameTaskV2` 中 → migrate 保留但不使用（safe reset 路径会清除）
- **新代码**：`normalizeGameTaskDraft` 不再设置 `grantState`
- **可见性**改为单纯由 status 派生：
  - `hidden` → 不可见
  - `available` → 可见（板上「可接取」）
  - `active` → 可见（板上「进行中」）
  - `completed`/`failed` → 可见（已归档区）
  - 特殊：白名单 `FORMAL_TASK_BOARD_WHITELIST` 中的任务可在 active 时强行上板（临时保留，Phase 4 后消除）

### 2.3 删除文件

- `src/lib/tasks/taskVisibilityPolicy.ts` → 移除，功能合并到 `taskBoardUi.ts` 的纯函数 `getTaskVisibilityTier_derived`
- `src/lib/tasks/taskRevealModel.ts` → 评估是否仍被引用，如仅被 `taskBoardUi.ts` 引用则内联

---

## 3. 数值设定

### 3.1 活跃任务上限

| 参数名 | 值 | 说明 |
|---|---|---|
| `MAX_ACTIVE_TASKS` | 6 | 含 active + available 的总上限 |
| `MAX_COMMISSION_SLOTS` | 2 | 人物委托槽位（不含主线） |
| `MAX_OPPORTUNITY_SLOTS` | 1 | 机会事件槽位 |

策略：
- **超限时**：新 `new_tasks` 降级为「线索/软线」（不生成 task，仅记录为 clue）加 flag `new_tasks_capped_and_downgraded`
- **已有 active 任务腾出空间后**：优先从降级线索恢复为正式任务（自动，无需玩家操作）

### 3.2 节奏设计

- **开局**：仅 `main_escape_spine` active，其余通过 narrative grant 逐步发放
- **任务荒检测**：连续 3 回合无可推进（active）目标 → director 信号 `task_famine` → 强制 NPC 发钩子/情境线索
- **每回合上限**：`MAX_NEW_TASKS_PER_TURN = 3`（不变）

### 3.3 时限

- **deadline 格式**：`autoFailAfterGameHour: number`（hourIndex = day*24+hour，已有字段，不改名）
- **所有机会类任务**必须带 `autoFailAfterGameHour`
- **主线任务**应带宽松时限（如 5-7 日）
- **过期后果**：`residueOnFail` 字段 + auto-fail（store 已有接线）

### 3.4 结算权重

结算评分新维度 `taskCompletionScore: 0..1`：

```
taskCompletionScore = completedTasks / max(1, totalEverIssuedFormalTasks) * 1.0
  + (chainCompletionBonus: 0..0.3)  // 完整完成的任务链数加权
  + (mainTaskBonus: 0..0.2)         // 主线通关标记
```

结算页新增「任务成就」区块展示。

---

## 4. DM JSON 字段变更

### 4.1 `new_tasks` 新增可选字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `deadline` | `string` | model 输出格式 `"day:N,hour:N"`，normalize 时转为 `autoFailAfterGameHour` |
| `expiresAt` | (已有) | 仍保留用于 UI deadline 展示 |

### 4.2 `task_updates` 不变

保持现有字段兼容。当 `status` 试图回退终态时被状态机拦截并产生 flag。

---

## 5. 通知规则

### 5.1 事件定义

| 事件 | 触发条件 | UI 动作 |
|---|---|---|
| `new_task` | 新任务被添加到 store | 红点 badge + toast（持续 5s）+ 面板内高亮（跨回合保留到查看） |
| `task_progress` | requiredItemIds 中某项已满足 | toast + 面板内进度更新 + 动画勾选 |
| `task_completed` | 任务状态→completed | toast + 面板内完成动画 + 奖励弹窗 |
| `task_failed` | 任务状态→failed（含 auto-fail） | toast + 面板内失败标记 + 后果文案 |
| `task_deadline_approaching` | 距 autoFailAfterGameHour ≤ 2h | 压力文案 + 高亮环（仅当玩家在任务面板时） |
| `task_unlocked_hidden` | hidden → available/active | 同 `new_task` |

### 5.2 技术实现

- **红点**: `MobileBottomNav` 任务 tab 新增 `badge` prop，从 store selector `hasUnviewedTaskUpdates` 派生
- **Toast**: 复用现有 toast 机制（`ui_hints.toast_hint`），新增结构化参数 `{ event: "task_*", taskId, title }`
- **高亮**: `recentTaskHighlightIds`（Set<string> store 字段）跟踪未查看的任务变化
- **auto_open_panel**: 接线 `page.tsx` 的 phase 驱动 → `narrativeFeatureTriggers.ts` 的 `auto_open_panel` → 自动切到 MobileTaskPanel

---

## 6. UI 信息架构

### 6.1 布局（移动端优先）

```
MobileBottomNav
└── 任务 tab（带红点 badge）
    └── MobileTaskPanel（抽屉式/pagesheet）
        ├── 空状态引导（首次打开时）
        ├── 主线区（1 张舞台卡，全高展示）
        ├── 委托区（最多 2 张舞台卡，半高）
        ├── 机会区（最多 1 张，半高 + 时限标签）
        ├── 轻追踪区（单行摘要，默认折叠）
        │   ├── 牵连/承诺
        │   └── 线索影子
        ├── 已完成/已失败区（可折叠）
        └── 进度条（当前活跃数/上限 6，超限红色警告）
```

### 6.2 卡片详情六要素

| 要素 | 来源 | 展示 |
|---|---|---|
| 委托人 | issuerName/issuerId | 图标+名称行 |
| 为何要紧 | urgencyReason / playerHook | 单行氛围文案 |
| 下一步 | nextHint | 具体行动指示 |
| 奖励 | reward chips | 图标标签行 |
| 风险 | riskNote / canBackfire / highRiskHighReward | 危险标签 |
| 时限 | autoFailAfterGameHour | 倒计时/剩余回合数 |

### 6.3 空状态与 onboarding

首次打开任务面板时显示引导文案：
> "任务会在叙事推进中自然出现。第一件事已经在前方等你——先把手头的事做起来，答案在路上。"

后续空状态：
> "当前没有活跃任务。与 NPC 交谈、探索楼层会带来新的目标。"

---

## 7. 文案宪法

### 7.1 正向规范

| 字段 | 约束 |
|---|---|
| `title` | ≤12 字，有具体名词与钩子，禁抽象套话。好例：「借到一枚"通行印章"」；坏例：「完成地下二层探索」 |
| `desc` | 三拍：现状一句 + 要做什么 + 为什么是现在。≤80 字 |
| `nextHint` | 必须可执行，含人/地/物至少其一 |
| `urgencyReason` | 为什么现在不做就会错过/恶化 |
| `playerHook` | 一句让玩家在意的话（利益/情绪/好奇心） |

### 7.2 禁令清单

标题/desc/nextHint 全链路禁止：

- 万能套话：「帮我找到/调查一下/了解更多/揭开…的真相/看似…实则…/一探究竟/收集更多信息」
- 内部标签码泄露：`visited:`、`talked_to:`、`guidanceLevel`、`N-xxx` 暴露
- 奖牌腔：「完成可获得丰厚奖励」「任务奖励令人期待」
- 系统音：「检测到新线索」「任务已更新」「目标已添加」
- 自吹：「这是一个惊天的秘密」「你即将揭开…」
- 重复：同描述中同一名词不同语言写两次
- 连词堆砌：「不仅…而且…此外…」

### 7.3 Few-shot 示例

稳定 prompt 加 ≥4 组好/坏对照示例（从手写 starter 提炼），如：

```
好例：
  标题: "拼出出口路线碎片"
  desc: "向老刘换至少两条可验证碎片：谁见过地下二层的门、哪条传闻带物证、谁在撒谎。"
  nextHint: "先复述你在B1看到的不对劲，再问他：谁见过B2的门、谁能拿出证据。"

坏例：
  标题: "调查地下二层入口"
  desc: "了解更多关于地下二层的情报，收集更多信息以完成调查。"
  nextHint: "继续在老刘那里打探消息。"
```

**compact 快车道同步加约束**（当前连禁令都没有，必须加）。

---

## 8. taskCopyValidator

### 8.1 实现

```
src/lib/tasks/taskCopyValidator.ts (新增)
├── checkTitle(t: string): Issue[]  — 标题 lint
├── checkDesc(t: string): Issue[]    — 描述 lint
├── checkNextHint(t: string): Issue[] — nextHint lint
├── sanitizeTitle(t: string): string  — 确定性软替换（禁语 → 替代表达）
└── validateGameTask(t: GameTaskV2): TaskCopyValidationReport
```

### 8.2 接线

- 入口：`resolveDmTurn.ts` 的 task normalization 段
- 命中时：flag `task_copy_issue` + 遥测 + 严重时降级该任务为线索而非正式任务
- `scrubTaskTitleTemplates`：在 commitTurn 中做确定性软替换

### 8.3 测试

- ≥10 条 good case（通过）
- ≥10 条 must-fail 反例（被拦截）
- 含 compact 快车道输出反例

---

## 9. E2E 验收标准

### 9.1 任务专属 e2e spec

```spec
play/task-system.spec.ts
├── 开局仅授予语义正确的任务可见
├── 新任务出现时红点+通知可感
├── 接取语义正确（available→active 带叙事上下文）
├── 进度推进 UI 有 x/y 变化
├── 时限任务临期有压力呈现
├── 超时自动 failed 且后果落账
├── 完成时 toast+奖励+关系后果+链式解锁
├── DM 尝试复活已完成任务被拦截并 flag
├── task_updates 未知 id 被 flag
├── 单回合 >3 new_tasks 被 cap
└── 结算页体现任务完成度
```

### 9.2 可玩性验收剧本（mock，20 回合）

见主执行提示词 §8.2。

---

## 10. 类型变更清单

### 10.1 删除

| 类型/文件 | 状态 |
|---|---|
| `QuestState` | 删除 |
| `taskStatusToQuestState()` | 删除 |
| `questStateToTaskStatus()` | 删除 |
| `guardActivate()` | 删除 |
| `guardMarkDeliverable()` | 删除 |
| `guardComplete()` | 删除 |
| `guardFail()` | 删除 |
| `guardExpire()` | 删除 |
| `TaskGrantState` | 删除 |
| `getTaskVisibilityTier()` | 删除 |
| `isVisibleOnBoard/promiseOnly/asClue` | 内联到 taskBoardUi.ts |
| `TaskVisibilityTier` | 删除 |

### 10.2 修改

| 类型/文件 | 变更 |
|---|---|
| `GameTaskStatus` | 不变（5 值） |
| `GameTaskV2.grantState` | 删除 |
| `GameTaskV2.surfaceClass` | 保留（可选） |
| `GameTaskV2.autoFailAfterGameHour` | 保留，提供 prompt 输出指令 |
| `canTransition()` | 扩展为 `canTransitionStatus(from: GameTaskStatus, to: GameTaskStatus)` |
| `normalizeStatus()` | 不再缺省返回 "active"（改为 "available"） |

### 10.3 新增

| 类型/文件 | 说明 |
|---|---|
| `guardStatusTransition(task, to, ctx)` | 统一转移入口 |
| `taskCopyValidator.ts` | 任务文案 lint |
| `TaskCopyValidationReport` | 校验报告类型 |
| `MAX_ACTIVE_TASKS` 常量 | 活跃上限 |

---

## 11. 实施顺序依赖

```
Phase 1 (DESIGN) ──→ Phase 2 (engine) ──→ Phase 3 (store/archive)
                          │                      │
                          ├── Phase 5 (prompt) ───┤
                          │                      │
Phase 4 (UI) ─────────────┤                      │
                          ├── Phase 6 (content) ──┤
                          │                      │
                          └────── Phase 7 (coupling)
                                          │
                                    Phase 8 (acceptance)
                                          │
                                    Phase 9 (docs)
```

Phase 4 与 Phase 5 可并行（文件领地无交集）。
Phase 6 内容重写可 fan-out 3 个子 agent 并行。

---

## 12. 未决问题

| 问题 | 处理 |
|---|---|
| 旧存档中 `grantState` 字段的安全清理 | Phase 3 处理：migrate 时清除该字段 |
| `FORMAL_TASK_BOARD_WHITELIST` 硬编码白名单 | Phase 4 消除 |
| NPC 任务许诺与 status 的关系 | 保持现有 `npc_grant` claimMode，状态机守卫 |
| 任务与线索的手记关联 | 保持 `sourceClueIds` 引用（已有字段） |
