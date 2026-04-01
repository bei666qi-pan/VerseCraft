# 冲突回合玩家反馈层 v1

## 统一呈现逻辑

| 来源 | 处理 |
|------|------|
| `TurnEnvelope.conflict_outcome` | 优先；服务端 `resolveDmTurn` 已归一化 |
| `combat_summary` | 兼容：与 `conflict_outcome` 同形，由 `normalizeConflictOutcome` 解析 |
| `sanity_damage` / `relationship_updates` | 仅映射为文案档位（不展示数字条） |
| 叙事正文 `narrative` | 不自动注入 UI；`summary` / `suggestedDirection` 作为「回声」短句并入余音卡 |

映射实现：`buildConflictFeedbackViewModel`（`src/lib/play/conflictFeedbackPresentation.ts`）。

## 与 narrative 的衔接

1. **提示词侧**：`buildCombatPromptBlockV1` 已追加一行，要求实质对抗回合在 JSON 中带 `conflict_outcome`（或兼容 `combat_summary`），字段与裁决锚一致，且不得复述分数。
2. **玩家侧**：主叙事仍在日志流中完整展示；余音卡仅在 **非流式** 时出现在滚动区下方，作为「读完正文后的触感」，不替代 DM 文笔。
3. **频率**：`envelopeIsConflictSignificant` 为假时不渲染，避免和平回合刷屏。

## 玩家可见效果（余音卡）

- 标题：**局势余音**
- **态势**：`危险` / `可拼` / `可压` / `必撤` + 一行怪谈旁白
- **机会窗**、**代价预警**、**落点**（压制 / 逼退 / 互伤 / 撤离 / 失控）+ 短句
- 可选：引用式 **叙事回声**（来自 `summary` / `suggestedDirection`）

关闭：`NEXT_PUBLIC_VERSECRAFT_ENABLE_CONFLICT_FEEDBACK_V1=false`。

## 相关文件

- `src/lib/play/conflictFeedbackPresentation.ts` — 文案与 view-model
- `src/features/play/components/PlayConflictTurnWhisper.tsx` — 呈现组件
- `src/features/play/components/PlayStoryScroll.tsx` — 挂载位置
- `src/app/play/page.tsx` — commit 后写入 store
- `src/store/useGameStore.ts` — `conflictTurnFeedback`（不入 persist 白名单）
- `src/features/play/turnCommit/resolveDmTurn.ts` — `export normalizeConflictOutcome`
