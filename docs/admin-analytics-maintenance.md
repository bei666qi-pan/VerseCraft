# 后台统计与 AI 洞察维护说明

## 后台入口

- 页面入口：`/saiduhsa`
- 认证入口：`AdminShadowGate` 调用 `submitAdminShadowLogin`
- 后台 API：`/api/admin/*`
- Cron API：`/api/admin/cron/*`

所有后台 API 必须返回统一 envelope：`ok / data / degraded / reason`。认证失败固定返回 403；普通数据失败必须返回可解析的降级结构，前端只显示局部降级，不白屏。

## 鉴权与会话

- 页面和普通后台 API 使用 `ADMIN_PASSWORD` 生成 shadow session。
- Shadow cookie 名称：`admin_shadow_session`。
- Cookie 属性：`httpOnly=true`、`sameSite=strict`、`path=/`，生产环境 `secure=true`。
- 会话为绝对过期，默认 24 小时，集中配置在 `ADMIN_SHADOW_SESSION_MAX_AGE_SECONDS`。
- 当前允许并发登录；退出会清除当前浏览器 cookie。
- 登录失败按 IP hash + user-agent hash + 分钟窗口限流。Redis 可用时用 Redis，不可用时退回进程内限流桶。
- 不记录 cookie、session value、password、token、DATABASE_URL 等敏感明文。

## Cron Secret

- `ADMIN_PASSWORD` 只用于管理员登录。
- `ADMIN_CRON_SECRET` 只用于 `/api/admin/cron/*`。
- Cron 请求必须带 `x-cron-secret: <ADMIN_CRON_SECRET>`。
- 生产环境未配置 `ADMIN_CRON_SECRET` 时拒绝执行；开发环境也返回清晰降级原因。
- 不允许继续复用 `ADMIN_PASSWORD` 作为 cron secret。

## 数据写入与聚合

- 原始事件：`analytics_events`
- 会话：`user_sessions`
- 游客：`guest_registry`、`guest_daily_activity`
- 用户日活：`actor_daily_activity`、`user_daily_activity`
- Token 日聚合：`actor_daily_tokens`
- 后台日聚合：`admin_metrics_daily`
- 审计日志：`admin_audit_logs`

日级重建入口：`POST /api/admin/cron/rebuild-daily?days=N`。执行成功或失败都会写入审计日志。所有事件写入失败都必须 best-effort，不阻塞玩家主流程。

## 新后台 API

- `GET /api/admin/overview?range=today|yesterday|7d|30d`
- `GET /api/admin/player-journey?range=7d&actorType=all|registered|guest&platform=all|pc|mobile`
- `GET /api/admin/ai-experience?range=7d`
- `GET /api/admin/content-quality?range=7d`
- `GET /api/admin/system-health`
- `GET /api/admin/users?limit=20&cursor=&search=&onlyOnline=&actorType=all&sort=lastActive`
- `GET /api/admin/users/[actorKey]`
- `GET /api/admin/audit-logs?limit=20&cursor=`
- `POST /api/admin/rebuild-daily?days=3`

列表接口必须有 `limit`，默认 20，最大 100。时间范围查询必须走既有索引或新增索引，并纳入 `scripts/admin-explain-baseline.ts`。

## AI 洞察

- 输入构建：`src/lib/admin/aiInsights.ts`
- 输出校验：`src/lib/admin/aiInsightSchema.ts`
- API：`src/app/api/admin/ai-insights/route.ts`
- UI：`src/components/admin/AdminDashboardV2.tsx`

每条建议必须包含优先级、结论、证据指标、样本量、置信度、风险、实验建议、预期影响和下一步动作。样本不足时只能输出“证据不足”和补采建议，不能输出高置信结论。AI 失败时返回本地 fallback。

## 常见降级原因

- `db_unavailable`：数据库不可用或查询失败。
- `redis_unavailable`：Redis 不可用，登录限流使用进程内 fallback。
- `ai_gateway_unconfigured`：AI 网关未配置，洞察走本地 fallback。
- `insufficient_sample`：样本不足，趋势和建议不做强结论。
- `cron_secret_missing` / `cron_secret_invalid`：Cron secret 缺失或错误。

## 验证命令

- `npx eslint .`
- `pnpm test:unit`
- `pnpm test:ci`
- `pnpm test:admin:api`
- `pnpm test:admin:perf`
- `pnpm analyze:admin-sql`
- `pnpm analyze:admin-sql:strict`

`pnpm analyze:admin-sql` 需要真实 `DATABASE_URL`。DB、Redis、AI 网关不可用时，必须记录失败位置和是否与代码改动相关。

## 回滚方式

1. 回滚本次后台代码提交。
2. 若只需停用 cron，移除部署侧 `ADMIN_CRON_SECRET` 或停止外部调度器。
3. `admin_audit_logs` 为 additive 表，回滚代码不要求删除该表。
4. 如需删除新增表，另起破坏性迁移并提前确认数据保留策略。
