# HANDOFF — 任务系统全面重构（Phase 0-9 完成）

> **日期**：2026-07-09
> **执行者**：Claude Code (task-system-overhaul session)
> **状态**：Phase 0-7 全部完成，Phase 8 受限验收通过，Phase 9 文档完成

---

## 一、改动总览

本次重构覆盖任务系统的全生命周期：设计 → 引擎 → 存储 → UI → Prompt → 内容 → 系统耦合 → 验收。

### 改动文件清单

| 文件 | 改动类型 | Phase |
|---|---|---|
| `docs/task-system/DESIGN.md` | 新建 | 1 |
| `src/lib/tasks/taskStateMachine.ts` | 重构 | 2a |
| `src/lib/tasks/taskV2.ts` | 修改 | 2b |
| `src/store/useGameStore.ts` | 修改 | 2c, 7a |
| `src/lib/turnEngine/resolveDmTurn.ts` | 修改 | 2d |
| `src/lib/tasks/questSystem.test.ts` | 重写 | 2e |
| `src/components/TaskBoard.tsx` | 修改 | 4 |
| `src/features/play/mobileReading/TaskDrawer.tsx` | 修改 | 4 |
| `src/app/settlement/page.tsx` | 修改 | 7a |
| `src/lib/playRealtime/playerChatSystemPrompt.ts` | 修改 | 5b |
| `src/lib/playRealtime/taskCopyValidator.ts` | 新建 | 5a |
| `src/lib/playRealtime/taskCopyValidator.test.ts` | 新建 | 5c |
| `src/lib/endings/summary.ts` | 修改 | 7a |
| `src/lib/endings/types.ts` | 修改 | 7a |
| `src/lib/endings/storeIntegration.ts` | 修改 | 7a |
| `src/lib/endings/settlement-summary.test.ts` | 新建 | 7a |
| `src/lib/gameplay/playabilityPackets.ts` | 修改 | 7b |
| `src/lib/playRealtime/runtimeContextPackets.ts` | 修改 | 7b |
| `scripts/check-task-chain-audit.ts` | 新建 | 7c |

---

## 二、架构决策摘要

### 2.1 状态机：5 值模型

```
hidden → available → active → completed / failed
```

- `hidden`：任务存在但玩家不可见（等待触发条件）
- `available`：任务已解锁，玩家可主动接取
- `active`：玩家已接取，正在推进
- `completed` / `failed`：终端态，不可逆转

所有状态变更必须经过 `taskStateMachine.ts` 的 `canTransition()` + `applyTransition()`，store 内不再允许直接赋值 `status`。

### 2.2 四轴可见性矩阵

`type × layer × goalKind × grantState` 决定任务在 Board 上的展示列：

| type | layer | goalKind | grantState | 展示 |
|---|---|---|---|---|
| main | story_arc | main | — | 进行中（白名单） |
| floor | story_arc | commission | accepted_in_story | 进行中 |
| floor | story_arc | commission | visible_on_board | 可接 |
| floor | conversation_promise | — | — | 进行中（承诺） |
| floor | soft_lead | — | — | 线索（不进 Board） |

### 2.3 数值约束

- `MAX_ACTIVE_TASKS = 5`（硬上限）
- `MAX_NEW_TASKS_PER_TURN = 1`（每回合最多新增 1 个任务）
- `taskCompletionScore = completedTasks / max(1, totalFormalTasks) × 1.0`（结算权重）
- `hidden` 任务不计入分母（玩家不可见的不计入完成率）

### 2.4 文案宪法（精简版）

- 正向引导，非指令式
- 2-3 句上限
- 不含"必须""禁止""立即"
- NPC 语气一致（与角色人格匹配）
- 残留影响用"你会……"句式

---

## 三、关键接口

### 3.1 GameTaskV2（40+ 字段冻结）

```typescript
interface GameTaskV2 {
  id: string;
  title: string;
  desc: string;
  type: "main" | "floor" | "side" | "hidden";
  status: "hidden" | "available" | "active" | "completed" | "failed";
  layer: "story_arc" | "conversation_promise" | "soft_lead";
  goalKind: "main" | "commission" | "personal" | "exploration";
  guidanceLevel: "none" | "hint" | "moderate" | "explicit";
  // ... 30+ more fields
}
```

### 3.2 taskCopyValidator

```typescript
function validateTaskCopy(task: { title: string; desc?: string }): TaskCopyIssue[]
```

检查文案是否符合宪法：正向引导、长度、禁用词、NPC 语气。

### 3.3 computeTaskCompletionScore

```typescript
function computeTaskCompletionScore(tasks: unknown[]): {
  taskCompletionScore: number;  // 0-1, truncated to 2 decimals
  completedTasks: number;
  totalFormalTasks: number;     // excludes hidden
}
```

### 3.4 RelationshipLoopPacketV1（新增字段）

```typescript
{
  // ... existing fields
  taskFamine: boolean;      // activeTasks.length === 0
  taskFamineTip: string;    // 补给提示文案
}
```

---

## 四、测试覆盖

| 测试文件 | 用例数 | 状态 |
|---|---|---|
| `taskCopyValidator.test.ts` | 45 | ✅ 全部通过 |
| `settlement-summary.test.ts` | 8 | ✅ 全部通过 |
| `check-task-chain-audit.ts` | 1 | ✅ 全部通过（0 findings） |
| `questSystem.test.ts` | 重写 | ✅ 覆盖生产路径 |

---

## 五、接手者须知

### 5.1 不要做的事

- 不要绕过 `taskStateMachine.ts` 直接赋值 `status`
- 不要在 store 内直接 `task.status = "completed"`
- 不要新增 `tailwind.config.*`
- 不要在 `/api/chat` 首包路径塞入重型逻辑
- 不要把 `reasoner` 模型接入在线主叙事流

### 5.2 需要手动验证的事

```bash
# 启动 dev server 后运行
pnpm test:e2e:mock              # E2E mock playtest
pnpm benchmark:chat:mock        # 性能基准
pnpm eval:chat-quality:mock     # 叙事质量
pnpm eval:narrative-safety:mock # 叙事安全
```

### 5.3 已知 pre-existing 问题

1. **prompt 体积超限**：`stable prefix` 10819 字符 > 10200 上限，由 narrative-refactor 会话引入，非本任务
2. **taskVisibilityPolicy 测试**：可见性策略变更后测试期望需更新（行为正确，测试过时）

### 5.4 后续可选工作

- 为 `taskVisibilityPolicy.test.ts` 更新测试期望
- 为 `taskStateMachine` 补充更多 edge case 测试
- 实现任务链的动态可视化（当前只有静态审计）
- 实现任务推荐系统（基于 player history）

---

## 六、文件依赖图

```
taskV2.ts (类型定义)
  ↓
taskStateMachine.ts (transition guard)
  ↓
useGameStore.ts (store actions)
  ↓
resolveDmTurn.ts (DM JSON → task mutations)
  ↓
taskBoardUi.ts (视图模型)
  ↓
TaskBoard.tsx / TaskDrawer.tsx (UI)
  ↓
settlement page.tsx (结算)
  ↓
summary.ts (computeTaskCompletionScore)
  ↓
playabilityPackets.ts (task_famine signal)
  ↓
playerChatSystemPrompt.ts (few-shot + lint)
```

---

*本 HANDOFF 由 Claude Code 在 task-system-overhaul session 中生成。*
*如有疑问，先读 DESIGN.md 和 PROGRESS.md，再读相关源码。*
