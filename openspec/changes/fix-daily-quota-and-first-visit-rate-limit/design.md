## Context

`/api/chat` 由 middleware 的本地限流器在路由执行前保护。当前主聊天桶以 IP、UA 和可选的 `x-versecraft-client-fingerprint` 组成键；当指纹在无痕、存储受限或首个客户端请求中缺失时，同一出口 IP 的请求会退化为同一桶。配额的读取横跨 `users_quota`（注册用户）与 `actor_daily_tokens`（游客），两者的 `date_key` 已按 UTC 自然日写入，不能随意改变既有 analytics 口径。

## Goals / Non-Goals

**Goals:**

- 使已正常打开产品页的无痕浏览器在首轮聊天时拥有稳定的服务端限流身份，即使 localStorage 不可用。
- 沿用现有 UTC 日配额键，让用户与游客跨日读取到新日的零消耗，并明确下一次刷新时刻。
- 保持 chat SSE、analytics 事件、数据库 schema 与在线主链路阶段不变。

**Non-Goals:**

- 不放宽或取消 IP 限流，也不将客户端可伪造指纹当成认证凭据。
- 不把 analytics 的 UTC `date_key` 全面迁移到北京时间，也不改变用户的免费额度数值。
- 不增加同步配额写入、模型重试或新的前端状态源。

## Decisions

1. middleware 在普通页面响应中下发 HttpOnly、SameSite=Lax 的随机匿名限流 cookie；聊天请求优先使用有效客户端指纹，其次使用该 cookie，最后才回退 IP + UA。这样正常的“先打开 `/play`，再点击行动”不会与共享出口的无指纹请求共桶，同时 cookie 不暴露给脚本、也不取代 IP/UA 的防护维度。通过 `VERSECRAFT_ENABLE_ANONYMOUS_CHAT_LIMIT_IDENTITY=false` 可回退旧键。
   - 备选：仅提高全局聊天 QPS。会降低所有共享 IP 的保护强度，不能解决身份退化根因。
   - 备选：要求前端 localStorage 指纹。无痕/隐私模式正是该方案不可靠的场景。

2. 配额继续采用现有 UTC `YYYY-MM-DD` 日键。新增纯日期窗口 / `nextRefreshAt` helper，检查当日键、计算到下一个 UTC 日界的刷新瞬间，并格式化为北京时间给玩家阅读。注册用户的 `users_quota.last_action_date` 已由写入端跨日归零；游客按 `actor_daily_tokens.date_key` 查询，新键自然不会读取前日记录。
   - 备选：将所有日键迁到北京时间。会影响 analytics、DAU、幂等与历史口径，超出本次修复范围。

3. `QuotaCheckResult` 在成功和拒绝结果中携带 `nextRefreshAt`。`buildQuotaLimitMessage` 将其编入中文拒绝文本；`/api/chat` 继续把该文本包进现有 SSE final payload，不添加必填 DM JSON 字段。analytics 保留原事件名和 payload 键，可附加刷新时刻诊断字段。

## Risks / Trade-offs

- [首次直接调用 `/api/chat` 没有 cookie] → 保留 IP + UA 回退；正常产品流程会先经过页面响应并获得 cookie。
- [cookie 被清除或隐私策略拒绝] → 请求保持可用且沿用现有客户端指纹 / IP 回退，不依赖 cookie 作为唯一身份。
- [用户误解 UTC 日界] → 文案明确显示准确的北京时间时刻，而不使用含糊的“明天”。
- [限流灰度回退] → 开关关闭时只停用 cookie 身份，不影响既有 header 指纹、SSE 或配额逻辑。

## Migration Plan

1. 部署后新页面响应自动签发 cookie，无需数据迁移或回填。
2. 旧浏览器没有 cookie 时按既有键限流，下一次页面导航后自动升级。
3. 若观察到异常，关闭 `VERSECRAFT_ENABLE_ANONYMOUS_CHAT_LIMIT_IDENTITY`，限流键立即回退；配额刷新提示是纯附加展示，不影响账本。

## Open Questions

- 无。本次保持仓库既有 UTC 日键约定，刷新时刻向用户以北京时间精确展示。
