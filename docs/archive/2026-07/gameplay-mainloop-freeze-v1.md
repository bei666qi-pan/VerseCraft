# VerseCraft 玩法主骨架冻结规范（V1）

状态：Frozen（本文件生效后，后续玩法设计与重构以此为唯一标准）  
适用范围：`/play` 主循环、`/api/chat` 回合裁决链路、任务/冲突/结算相关 UI 与状态系统  
生效原则：不破坏现有 SSE 契约、不破坏存档兼容、不破坏登录与基础游玩主链路

---

## 1. 核心游戏体验定义

VerseCraft 的核心体验不是“系统堆叠”，而是：

**在持续压迫的怪谈公寓中，以关系与代价换取生存窗口，最终完成唯一目标：走出去。**

玩家每回合必须能回答五个问题：

1. 我当前的核心目标是什么（主线逃生目标）
2. 我为什么要做这件事（人物委托或主线门槛）
3. 我面对的是谁（关键人物/势力/威胁源）
4. 这件事风险多大（隐藏态势与冲突窗口）
5. 做完会推进什么（主线阶段、关系、资源、位置）

如果某个系统不能直接服务这五个问题，就必须降级为后台支撑层。

---

## 2. 一核两翼（项目长期结构）

## 2.1 一核：走出去（唯一主线）

- 唯一顶层目标：离开公寓（Escape Mainline）
- 所有回合产出都要映射到“主线推进值”或“主线阻塞解除”
- 禁止出现与主线竞争主视野的第二主线

主线承载模块（已有）：

- `src/lib/escapeMainline/integration.ts`
- `src/lib/escapeMainline/derive.ts`
- `src/lib/tasks/taskV2.ts`（`main_escape_*` 系列任务）
- `src/store/useGameStore.ts`（`advanceEscapeMainlineFromResolvedTurn`）

## 2.2 左翼：任务系统（回答“为什么行动”）

- 任务不是记事本，而是“行动动机与代价契约”
- 任务对玩家只呈现：动机、对象、风险、下一步、推进结果
- 任务板只保留“头等事 + 少量牵连”，不做后台全量列表透出

主承载模块：

- `src/lib/tasks/taskV2.ts`
- `src/lib/tasks/taskVisibilityPolicy.ts`
- `src/lib/tasks/taskNarrativeGrant.ts`
- `src/lib/play/taskBoardUi.ts`
- `src/features/play/components/PlayNarrativeTaskBoard.tsx`

## 2.3 右翼：隐藏态势系统（回答“怎么行动”）

- 隐藏态势不是单纯战斗公式，而是“当前是否有冲突窗口、窗口代价是否可承受”
- 它决定行动方式（硬顶、迂回、交易、撤离），并反馈后果
- 玩家可感知结果与风险提示，但不暴露后台计算细节

主承载模块：

- `src/lib/combat/combatPromptBlock.ts`
- `src/lib/combat/combatAdjudication.ts`
- `src/lib/combat/playerCombatScore.ts`
- `src/lib/combat/combatPresentation.ts`
- `src/app/play/page.tsx`（冲突回合 commit 后果展示）

---

## 3. 单回合核心循环（唯一规范）

每回合按以下顺序闭环，禁止新增绕行主链路：

1. **目标确认**
   - 系统明确本回合主目标锚点（通常是“头等事”）
2. **动机注入**
   - 由主线门槛或人物委托给出“为何现在行动”
3. **态势裁决**
   - 后台评估当前冲突窗口、风险级别、可行行动
4. **玩家决策**
   - 进入 `decision_required`（2-4 选项）或 `narrative_only`（继续推进）
5. **后果提交**
   - 回写任务/关系/资源/位置/时间/主线推进
6. **反馈落地**
   - 告诉玩家“推进了什么、代价是什么、下一步是什么”

对应当前仓库链路：

- 服务端裁决：`src/app/api/chat/route.ts`
- 回合一致性收口：`src/features/play/turnCommit/resolveDmTurn.ts`
- SSE 结果解析：`src/features/play/stream/turnResolve.ts`
- 前端 commit：`src/app/play/page.tsx`
- 状态归档：`src/store/useGameStore.ts`

---

## 4. 关键概念冻结定义

## 4.1 主线目标（Mainline Objective）

- 定义：唯一“走出去”推进链上的阶段目标
- 判定：必须能映射到出口路径、门槛、代价、假出口识别中的至少一项
- 表现：任务板“头等事”优先显示

## 4.2 人物委托（Character Commission）

- 定义：由具体 NPC 发起，驱动玩家采取可验证行动的契约
- 必须包含：委托人、目的、风险、回报、关系后果
- 作用：为主线提供可执行中间步骤，不得成为独立主线

## 4.3 机会事件（Opportunity Event）

- 定义：本回合临时出现的可利用窗口（线索、交易、放行、短时通路）
- 要求：必须服务主线或关键委托推进，不得成为纯背景噪音
- 生命周期：短时有效，逾期失效或反噬

## 4.4 隐藏态势 / 冲突窗口（Hidden Posture / Conflict Window）

- 定义：场景压力、人物敌意、威胁相位与位置条件共同形成的“可行动窗口”
- 输出给玩家的最小信息：风险级别、可行路径、预期代价
- 禁止：仅给后台分数，不给玩家任何可操作解释

## 4.5 玩家成长（Player Growth）

- 定义：玩家对“活下来并走出去”的能力增强
- 组成：关系信用、风险判断能力、可调用资源、关键门槛通行能力
- 限制：不演化为传统数值 RPG 面板堆叠

## 4.6 失败成本（Failure Cost）

- 定义：一次错误决策导致的可感知损失
- 包括：关系受损、窗口关闭、资源折损、风险上升、主线延后
- 约束：失败应可恢复，但必须有真实代价

## 4.7 系统奖励（System Reward）

- 定义：对“正确推进主线/委托”的结构化正反馈
- 包括：主线阶段推进、关键条件解锁、关系资本、资源补给
- 禁止：只给数值不告诉“推进了什么”

---

## 5. 玩家表层系统（仅保留这些）

玩家可见层只保留以下核心：

1. 主线头等事（唯一核心目标）
2. 在办委托（最多少量并行）
3. 牵连与风险（承诺/反噬提示）
4. 回合决策（2-4 选项或明确继续）
5. 回合后果反馈（推进/代价/下一步）

对应模块：

- `src/features/play/components/PlayNarrativeTaskBoard.tsx`
- `src/lib/play/taskBoardUi.ts`
- `src/app/play/page.tsx`
- `src/features/play/turnCommit/turnEnvelope.ts`

---

## 6. 后台支撑层职责（必须降噪）

以下系统继续保留，但不得抢主玩法控制权：

- 记忆脊柱与事实写回（`src/lib/memorySpine/*`, `persistTurnFacts`）
- 导演与事件队列（`src/lib/storyDirector/*`）
- runtime context packets（`src/lib/playRealtime/runtimeContextPackets.ts`）
- 图鉴自动补录与一致性修补（`codex` 自动提取/修正）
- 输出审计与协议守卫（`src/app/api/chat/route.ts` 安全链路）

职责原则：

1. 只增强稳定性与一致性
2. 不直接改变玩家主目标优先级
3. 不新增前台噪音入口
4. 不以“系统提示”替代叙事交付

---

## 7. 非目标（明确禁止）

以下方向在冻结阶段禁止推进：

- 把 VerseCraft 改造成传统数值 RPG
- 引入第二条与“走出去”并列的主线
- 让任务系统继续作为“待办记事本”
- 让战斗系统停留在纯后台公式且玩家无可解释反馈
- 在前台继续新增并列大面板争夺注意力

---

## 8. 编码落地约束（后续阶段强制遵循）

## 8.1 回合协议约束

- 不破坏 SSE 最终帧契约（`__VERSECRAFT_FINAL__`）
- 不破坏 `TurnEnvelope` 兼容字段（`options` 保持兼容）
- `resolveDmTurn` 继续作为统一收口点

## 8.2 状态兼容约束

- 不破坏存档读取与迁移（`snapshot/migration` 链路）
- 不破坏基础链路：登录、开局、游玩、背包、图鉴、结算

## 8.3 玩法优先级约束

- 所有新增逻辑必须回答：是否让玩家更清楚“现在该做什么”
- 不能回答则放到后台层，且默认不前台曝光

---

## 9. 验收口径（以后所有改动必须对齐）

每个迭代必须满足以下最小验收：

1. 玩家进入回合后，能在 3 秒内识别当前“头等事”
2. 每次提交后，能明确看到“推进项 + 代价项 + 下一步”
3. `decision_required` 回合不出现长期无可用选项
4. 主线推进相关回合占比持续可追踪（不被支线噪音淹没）
5. 不出现前后端状态冲突导致的“叙事说有、状态没写入”

---

## 10. 对现有模块的冻结映射（供重构实施）

- 主循环入口：`src/app/play/page.tsx` 的 `sendAction` 与 turn commit 段
- 服务端裁决总线：`src/app/api/chat/route.ts`
- 回合一致性总闸：`src/features/play/turnCommit/resolveDmTurn.ts`
- 任务语义层：`src/lib/tasks/taskV2.ts`, `taskVisibilityPolicy.ts`, `taskNarrativeGrant.ts`
- 表层任务 UI：`src/lib/play/taskBoardUi.ts`, `PlayNarrativeTaskBoard.tsx`
- 隐藏态势层：`src/lib/combat/combatPromptBlock.ts`, `combatAdjudication.ts`, `playerCombatScore.ts`
- 状态提交与存档兼容：`src/store/useGameStore.ts`

后续所有“玩法重构 PR”必须在描述中引用本文件，并明确：

1. 改动影响的是一核还是两翼
2. 是否改变玩家表层信息密度
3. 是否触碰后台支撑层边界
4. 如何证明更接近“每回合可决策、可推进、可反馈”

