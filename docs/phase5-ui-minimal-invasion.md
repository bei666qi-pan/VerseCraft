# 阶段 5：前端最小侵入式改造（设计说明 + 落点）

## 1. 最适合承载新系统的 UI 位置

| 系统 | 承载位置 | 理由 |
| --- | --- | --- |
| **目标分层** | 对局内 `PlayTaskPanel`（右侧浮层）+ 设置页底部 `PlayNarrativeTaskBoard`（embedded） | 玩家查目标的主要入口仍是任务栏；设置里补一份不增加新 Tab，避免打断侧栏结构。 |
| **手记分区** | `UnifiedMenuModal` →「灵感手记」左栏（行囊上方可折叠块） | 手记与行囊在产品语义上同属「灵感手记」，不新开 Tab；左栏本来就是信息列表区。 |
| **物品标签** | 手记左栏槽位列表 + 右侧详情标题下 | 不改变布局，只叠短标签行。 |
| **仓库材料标签** | `WarehousePanel` 格子与详情 | 仓库物品无 `Item` 注册表语义，统一标「材料」即可。 |
| **获得反馈** | 沿用 `firstTimeHint`（顶栏轻提示），合并同回合多条提示 | 无新组件、无额外订阅；避免与现有 toast 链路重复造轮子。 |

## 2. 最小改动方案（摘要）

- **纯函数分层**：`taskBoardUi.ts`、`journalBoardUi.ts` 负责分类/排序，UI 只渲染结果。
- **单一任务板组件**：`PlayNarrativeTaskBoard` 供浮层（light）与设置页（dark）复用，差异仅 `density` 样式。
- **手记**：按 `ClueEntry` 的 kind/status/关联字段归入五类；隐藏项仍过滤。
- **物品**：`getItemUiRoleTags` 基于既有 `inferItemDomainLayer` + 关键物规则。
- **反馈**：`acquireHudHints` 数组在回合提交管道内合并 `手记更新` 与 `新目标`。

## 3. 组件改造清单

| 文件 | 改动 |
| --- | --- |
| `src/lib/play/taskBoardUi.ts` | 新建：头等事/路径/承诺风险/归档划分 |
| `src/lib/play/journalBoardUi.ts` | 新建：手记主分区 |
| `src/lib/play/itemGameplay.ts` | `getItemUiRoleTags` |
| `src/features/play/components/PlayNarrativeTaskBoard.tsx` | 新建：分层任务板 + 关联手记/NPC/物 |
| `src/features/play/components/PlayTaskPanel.tsx` | 瘦身为壳 + 内嵌 `PlayNarrativeTaskBoard` |
| `src/components/UnifiedMenuModal.tsx` | 手记折叠区、物品标签、设置页任务板、删未使用 `TasksPanel` |
| `src/app/play/page.tsx` | 传入 `journalClues`/`codex`、手记与新目标合并提示 |

## 4. 改动理由（对照需求）

- **信息层级**：头等事单独强调 + 可推进限 4 + 承诺/风险成组 + 其余折叠 + 完成/失败归档。
- **显眼度**：保留琥珀/靛青等现有色板，仅加强分区标题与卡片强调态。
- **状态反馈**：新线索与新任务不再互相覆盖提示字符串。
- **入口清晰**：手记集中在「灵感手记」Tab，无需找第二个入口。
- **关联展示**：任务卡展示 `relatedObjectiveId` 手记标题、`relatedNpcIds` 解析名、`relatedItemIds`/奖励物名称。

## 5. 风险评估

| 风险 | 缓解 |
| --- | --- |
| 头等事算法与玩家直觉不符 | 规则透明（主线 goalKind/type 优先），可后续按存档数据调权重。 |
| 手记仅归一个主分区 | 为控制噪音；跨类线索以最高优先级区展示。 |
| 左栏手记 + 槽位变长 | 手记区 `max-h-44` + 内部滚动，避免撑爆。 |
| 同回合多条 `setFirstTimeHint` | 已合并为一条；仍可能被后续逻辑覆盖（如选项为空提示），属既有行为。 |

## 6. 兼容与性能

- 旧任务无 `goalKind` 时走 `inferObjectiveKind`。
- 旧存档无手记为空，不展示手记块。
- 无新增全局轮询；`useMemo` 仅在 Tab 打开时计算（Activity hidden 时子树仍挂载但成本低）。
