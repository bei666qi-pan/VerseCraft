## Why

真实 `/api/chat` 游玩轨迹显示：模型可以叙述“捡起已装备物品”等已被权威状态否定的动作。现有 validator 能记录 `inventory_conflict`，但在 shadow 模式仍将原叙事提交给玩家，使“状态是对的、小说说错了”的硬性幻觉成为可见体验。

## What Changes

- 对已被 `validateNarrative` 明确识别的状态—叙事冲突，按字段采取可审计的保守降级，而非仅记录 telemetry。
- 首个范围只处理无奖励支撑的物品获得/重复获得措辞；保留结构化状态、SSE final envelope 和其他文学描写。
- 通过灰度开关启用；关闭时保持现有 shadow 行为。降级失败时不伪造状态，保留可观测的 issue 和安全文本。
- 当 hard safety block 已剥离战斗 delta 时，同时替换“命中/压制/武器损耗”等玩家可见战果，避免 narrative 抢在权威状态之前成为事实。

## Capabilities

### New Capabilities

- `narrative-state-conflict-degrade`: 在权威 state delta 与玩家可见叙事冲突时，阻止或改写可验证的错误事实声明。

### Modified Capabilities

- 无。

## Impact

- 影响 `/api/chat` final hooks / `commitTurn` 的 post-generation 提交路径，不改变 SSE、DM JSON 最低字段、数据库 schema 或 analytics 事件名。
- 仅使用已在内存中的 candidate DM、validator report 和 state/inventory context，不增加首包前 IO、模型调用或 TTFT；执行在 final hook 中。
- 风险由 `VERSECRAFT_ENABLE_NARRATIVE_STATE_CONFLICT_DEGRADE` 灰度控制。非目标：不改写一般文风、NPC 对话、世界事实 registry、任务/职业状态机或 Director。
