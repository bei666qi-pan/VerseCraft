## Why

首次以无痕或存储受限浏览器进入 `/play` 时，正常的第一轮行动可能与共享 IP 的其他流量落入同一个聊天限流桶，并被误报为 `rate_limited`。同时，用户和游客的免费 Token 配额缺少一个统一、可见且可验证的每日刷新时点，额度用尽后只得到模糊的“明天再试”提示。

## What Changes

- 为聊天中间件提供服务端持久的匿名浏览器限流身份，在客户端指纹缺失或不稳定时仍将正常浏览器隔离于共享 IP 流量。
- 统一免费配额的日界与下一次刷新时间计算，并让注册用户和游客都按同一日界读取当天的实际已用额度。
- 在 `/api/chat` 的额度拒绝 SSE 叙事中标出对应额度的下一次刷新时间；维持现有 200 + SSE 和最终 DM JSON 收口。
- 为匿名限流隔离、配额跨日读取和刷新时间文案补充回归测试。

## Capabilities

### New Capabilities

- `anonymous-chat-admission`: 为正常的首次匿名聊天请求提供稳定、隔离且可回退的中间件限流身份。
- `daily-free-quota-refresh`: 为注册用户与游客按统一日界结算免费 Token 配额，并在用尽时说明下一次刷新时间。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：`src/middleware.ts`、`src/lib/quota.ts`、`src/lib/quotaPolicy.ts`、`src/app/api/chat/route.ts` 及对应单元/契约测试。
- `/api/chat` 继续返回 `text/event-stream`；额度拒绝仍由现有 SSE 终帧承载，DM JSON 最低四键及 analytics 事件名不变。
- 不改数据库 schema；现有 `users_quota` 与 `actor_daily_tokens` 数据按日期键自然实现跨日刷新。仅在请求首字前增加纯 cookie 读取/写入和确定性日期计算，不新增 DB 查询、模型调用或重试；未取得浏览器身份时保留 IP + UA 的保守回退。
- 不涉及 prompt、AI routing、world tick、store hydration 或叙事 validator；新增行为通过 `VERSECRAFT_ENABLE_ANONYMOUS_CHAT_LIMIT_IDENTITY` 灰度开关可关闭。
