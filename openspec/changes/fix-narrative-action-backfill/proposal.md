## Why

真实回合的候选 DM 文本有时只在叙事中表达拾取、消耗或货币变化。现有受限动作回填本应将这类可验证动作补入候选结构化字段，但变量引用错误会抛出异常并被静默捕获，使玩家看到的行动与权威状态脱节。

## What Changes

- 修复 post-generation 动作解析调用中的变量引用，并把它限制为审计信号，不能把自由叙事写回候选状态字段。
- 新增回归测试，证明受支持叙事动作会被审计、已有结构化值保持优先，且叙事本身不能形成 award delta。
- 修复同一路径的 TypeScript 严格检查问题，使回填和最终提交层可被持续类型检查。

## Capabilities

### New Capabilities

- `narrative-action-backfill-reliability`: 受限的叙事动作解析可靠运行并保留可观测性，且不把自由文本当作状态来源。

### Modified Capabilities

- 无。

## Impact

- 影响 `validateNarrative` 的 final-hook 候选 DM 收口、`commitTurn` 的类型安全和其单元测试；不改 `/api/chat` 的 SSE/JSON 契约、数据库 schema、analytics 事件或模型路由。
- 回填仍为纯内存规则，不增加模型调用、数据库 IO、首个 SSE status/text 之前的工作或 TTFT。
- 不新增配置开关：这是既有受限回填功能的缺陷修复；异常路径仍保留保守的“不回填、不伪造状态”降级。
