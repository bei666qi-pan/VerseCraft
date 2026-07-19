## Why

真实 World Director probe 复现了一个 all-or-nothing 验证缺陷：模型计划同时包含两条合规软提示和一条缺失安全字段的高优先级事件时，validator 会拒绝整份计划，导致安全事件也无法进入 agenda。导演已真实推演却不能稳定影响后续回合，违背后台导演的产品目的。

## What Changes

- 将 world director 验证改为：计划级高风险仍拒绝全部，事件级高风险只拒绝该事件并保留其余已验证事件。
- 保留所有安全、剧透、玩家自主性和私有钩子硬门；不会为不合格事件补造内容或默认放行高优先级结果。
- 为混合计划、全局风险和实时 worker/probe 添加回归与真实持久化验证。

## Capabilities

### New Capabilities

- `director-partial-agenda-commit`: 对混合质量的后台导演计划安全提交独立合规 agenda 项。

### Modified Capabilities

- 无。

## Impact

- 影响 `src/lib/worldEngine/validator.ts` 的验收语义、worker agenda 写入和 director telemetry；不改 `/api/chat` SSE、客户端状态、数据库 schema 或在线首字路径。
- 不合规单项继续被拒绝并记录其 event code；计划级高风险仍不写 agenda。现有 director 开关保持有效。
- 非目标：不降低单事件字段要求、不让模型直接提交玩家状态、不添加在线 reasoner 调用。
