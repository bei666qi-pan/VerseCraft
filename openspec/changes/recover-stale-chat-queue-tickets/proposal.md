## Why

浏览器实测发现，持久化的排队 ticket 在页面重载或 ticket 到期的边界上可能先被轮询为可执行、随后被 `/api/chat` 拒绝为 `invalid_ticket`。客户端把这种可恢复的陈旧 ticket 误报为普通生成失败，留下错误提示并中断玩家行动。

## What Changes

- 识别 `/api/chat` 对已恢复或本次刚获准 ticket 返回的可恢复 409 拒绝。
- 清除该 ticket 的本地恢复记录，仅重新申请一次正常 queue admission，再继续同一玩家行动。
- 保持非 ticket 错误、模型错误和已有模型请求的现有失败语义；不重放已提交的模型回合。
- 为陈旧 ticket、成功重入队和非可恢复 409 补充客户端回归测试。

## Capabilities

### New Capabilities

- `chat-queue-stale-ticket-recovery`: 玩家页面在 queue ticket 失效竞态下安全恢复一次可执行行动。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：`src/app/play/page.tsx` 及其纯函数测试辅助。
- `/api/chat` 的 SSE、终帧、DM JSON、analytics、数据库 schema 和 world tick 均不改变。
- 恢复只发生在收到 409 后，不增加首字前路径、模型调用重试或在线回合 TTFT；重入队失败时保留现有可见失败提示。
