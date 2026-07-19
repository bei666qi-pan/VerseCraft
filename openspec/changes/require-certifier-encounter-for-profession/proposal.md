## Why

职业认证是不可逆的单职业提交。当前页面把认证 NPC 的运行时位置当成玩家本回合已遇到该 NPC 的证据；同在一楼但未实际相遇的 NPC 可能因此错误打开认证选择，造成无法回滚的职业状态问题。

## What Changes

- 将认证签发者相遇门禁收紧为本回合结构化 DM 的 NPC 出现更新，并将已经确认相遇的事实写入 client-first 主存档；store 的不可逆认证 action 也必须再次验证该状态，不能只依赖页面是否展示选项。
- 提取纯函数门禁并补充通过、非签发者、仅位置同楼等回归测试。
- 使用真实 DM 试炼完成证据与客户端认证 action 的集成验证分层证明：模型不能直接授予职业，客户端也不能凭 NPC 位置绕过相遇。

## Capabilities

### New Capabilities

- `profession-certification-encounter-gate`: 对不可逆职业认证选择实施结构化签发者相遇证据门禁。

### Modified Capabilities

- 无。

## Impact

- 影响 `/play` 回合提交后的职业选择 UI、client-first persisted state 和纯函数测试；不改变 `/api/chat` SSE/DM JSON、数据库 schema 或 analytics 事件。旧存档缺少相遇字段时安全回落为未确认，不能伪造已相遇事实。
- 无首字、TTFT 或后台导演影响；门禁只消费已完成回合的结构化字段，失败时不显示认证选择而不是伪造进度。
- 非目标：不改变职业资格计算、试炼任务、职业主动技能或引入对实时回合的额外模型调用。
