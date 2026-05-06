# Chat 回合基准样本

`benchmarks/chat-turns/*.json` 用于 `/api/chat` benchmark。它们不是随手示例，而是性能、SSE contract、叙事长度、选项质量和 analytics 字段的固定回归样本。

每个 fixture 必须包含：

- `scenario`：稳定场景 id。
- `latestUserInput` / `playerContext`：发送给 `/api/chat` 的输入。
- `expect.minNarrativeChars`：本场景的最小叙事长度。
- `expect.optionsCount`：默认 4。
- `expect.allowOptionsMissing`：只有明确降级/恢复场景可设为 true。
- `expect.mustContainAny` / `expect.mustNotContain`：防止 prompt 泄露和 UI 操作类选项。

当前场景：

| 文件 | 场景 | 主要观测 |
| --- | --- | --- |
| `normal_action.json` | 普通探索 | TTFT、final、叙事长度、4 个行动选项 |
| `npc_dialogue.json` | NPC 对话 | 对话上下文与可执行选项 |
| `item_interaction.json` | 物品/调查 | 防止选项退化成“查看背包/使用道具” |
| `combat_high_rules.json` | 战斗/强规则 | 高规则压力下 final JSON 与选项质量 |
| `long_context.json` | 长上下文 | stable/dynamic prompt、缓存前缀、终帧预算 |
| `preflight_sensitive.json` | 敏感预检 | degraded/live/mock 都必须快速结束且可观测 |

运行：

```bash
pnpm benchmark:chat-metrics
AI_PROVIDER=mock pnpm benchmark:chat-metrics -- --mode mock --assert-budget --include-all --json-out .runtime-data/chat-benchmark-mock.json
VC_FORCE_AI_KEYS_MISSING=1 pnpm benchmark:chat-metrics -- --mode degraded --assert-budget
E2E_AI_LIVE=1 pnpm benchmark:chat-metrics -- --mode live --assert-budget --include-all
```

`--assert-budget` 同时检查性能、SSE contract、narrative 非空、options 数量与 options 语义质量。
