## Why

真实 `/api/chat` 轨迹出现 `server_internal_generation_failed`，而同一网关的十次直连 p95 完成时间为 2.67 秒。当前 malformed-DM final repair 默认仅 2 秒，无法覆盖实际修复调用，导致可恢复的模型格式错误退化成玩家可见站点失败。

## What Changes

- 将共享的 final-hook 修复默认预算调至覆盖已测网关 p95 的受限窗口：malformed-DM 保持 4 秒请求，post-validator 的真实叙事修复可使用完整窗口。
- 对非提示注入的实体 hard block 先走已有真实 AI narrative-only repair，再以同一安全审计复核；只有修复仍不合格才使用确定性安全降级。
- 保持环境变量覆盖、12 秒硬上限与修复失败的既有 SSE final fallback；不改变正常主回合生成。
- 增加预算契约测试，确保该路径只在主流输出无法解析后运行。

## Capabilities

### New Capabilities

- `malformed-dm-repair-budget`: 对可恢复的 DM 格式错误提供与真实网关延迟匹配、但受上限约束的 final-hook 修复预算。

### Modified Capabilities

- 无。

## Impact

- 仅影响 `/api/chat` 的生成后 final hook；不改 SSE 格式、状态 delta、数据库、analytics 事件或首字前路径。
- 异常回合最坏 final latency 增加至最多 6 秒默认窗口；正常可解析回合没有额外调用或 TTFT 影响。
