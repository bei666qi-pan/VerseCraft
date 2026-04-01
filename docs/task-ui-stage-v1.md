# 任务 UI「舞台感」v1

## 新旧 UI 对比思路

| 维度 | 旧（清单感） | 新（舞台感） |
|------|--------------|--------------|
| 信息结构 | 多徽章 + 长描述 + 元数据堆叠 | 每张卡固定五行：**谁给的 / 为何要紧 / 不做会怎样 / 做成能得到 / 风险感** |
| 主线 | 「头等事」标签与其它卡视觉接近 | **唯一置顶**：更大字号、双边框与琥珀主色，段落标题「现在最重要的事」 |
| 委托 vs 机会 | 主要靠 `goalKind` 小标签区分 | **委托**靛色体系，**机会**青色体系 + 底部一句「与委托不同…」 |
| 认知负载 | 像后台待办/日志 | 像压在眼前的选项：先读主线，再扫委托，最后看窗口 |

## 数据流说明

1. **原始任务列表** `GameTask[]`（来自 store / props）不变。
2. **`projectTaskBoardViewModel`**（`taskBoardUi.ts`）继续做 V3 可见性过滤与 **1+2+1** 分区（主线 1、委托最多 2、机会 1）。
3. **`buildTaskStageCardViewModel(task, role, codex)`** 将单任务投影为 **`TaskStageCardViewModel`**：五行文案全部由现有 `GameTask` / `GameTaskV2` 字段推导（`urgencyReason`、`playerHook`、`residueOnFail`、`reward.unlocks`、`relatedEscapeProgress`、`riskNote`、`highRiskHighReward`、`expiresAt` 等），**不在 React 组件内拼句**。
4. **`projectTaskBoardStageProjection(tasks, v3, codex)`** 一次返回 `{ board, cards }`，面板只消费 `cards` 渲染三段主舞台；牵连/线索/更多在办等仍用同一 builder + `inferTaskStageRole` 生成卡面，避免组件分叉业务。

## 关键组件说明

| 位置 | 职责 |
|------|------|
| `src/lib/play/taskBoardUi.ts` | `TaskStageCardViewModel`（含 `riskBand`：calm/uneasy/hot）、`buildTaskStageCardViewModel`、`inferTaskStageRole`、`projectTaskBoardStageProjection` |
| `src/features/play/components/PlayNarrativeTaskBoard.tsx` | 布局与视觉层级（`roleShellClasses`、`renderStageCard`）；局势条、折叠区、接取按钮 |
| `src/lib/ui/taskPlayerFacingText.ts` | `sanitizePlayerFacingInline`（供投影层清洗文案） |

## 验收清单

- [ ] 有可见任务时，**最多一张**主线舞台卡置顶，视觉明显重于其它卡。
- [ ] **人物委托**区最多两张，与 **机会事件**区最多一张可同时出现；机会卡使用青色体系，委托使用靛色体系。
- [ ] 每张主舞台卡仅展示五行 + 状态徽标 + 可选地点层级 + 接取按钮；无大段重复描述堆砌。
- [ ] 窄屏（`sm` 以下）标题与内边距可读，无横向溢出。
- [ ] 「更多在办 / 收起记录」折叠行为与改前一致；其它面板未改动路由与页面壳。
- [ ] `pnpm exec tsx --test src/lib/play/taskBoardUi.test.ts` 通过。
