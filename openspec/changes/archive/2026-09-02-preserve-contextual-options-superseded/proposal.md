## Why

真实 `/api/chat` 回合后，浏览器的 options-only 链路确实能生成四条行动，但语义质量门会把“电源室”“老刘”“已装备武器”等当前场景中可执行的选项全部误判为缺少字面叙事锚点。结果是玩家明明完成了修复或任务结算，仍可能看不到可点击行动，影响持续游玩的可靠性。

## What Changes

- 让选项语义质量门把结构化位置、当前在场 NPC、已装备武器和库存提示作为受限的可见场景锚点，而非只依赖 narrative 字面词。
- 保持对泛化、重复、无关地点和同质化选项的拒绝；结构化锚点只降低现有误伤，不自动接受任意选项。
- 为真实 recovery trace 中的“电源室 / 老刘 / 武器”选项增加回归测试，并以实际 options-only 请求验证通过质量门的行动能够被客户端写入。
- 保持“四条”作为补齐目标；若两至三条真实模型行动已通过全部质量门，则直接显示它们给玩家继续行动，而不清空或由客户端伪造剩余槽位。

## Capabilities

### New Capabilities

- `contextual-options-regeneration`: 让 options-only 质量门基于玩家已知的结构化场景上下文接受可执行行动，同时保留现有反泛化与去重约束。

### Modified Capabilities

- None.

## Impact

- 影响 `src/lib/play/optionsSemanticGuards.ts` 及其调用方的受限输入，不改 `/api/chat` SSE/DM JSON 契约、游戏状态、数据库、analytics 或主回合首字路径。
- 修复只在客户端收到 options-only final 后运行；不新增模型调用、不阻塞主回合 TTFT，并可通过现有 `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_SEMANTIC_GATE` 回滚到当前严格质量门。
