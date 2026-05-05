# VerseCraft 后台运营改造执行计划

## 当前后台已有能力

- `/saiduhsa` 通过 shadow cookie 进入，服务端首屏会预取 `getDashboardTableData()` 与 `getAdminChartData()`，客户端再轮询多个 `/api/admin/*` 接口。
- `/api/admin/overview`、`/realtime`、`/retention`、`/funnel`、`/feedback-insights`、`/survey-aggregate`、`/ai-insights` 已返回统一 envelope，但每个路由重复读取 cookie 并调用 `verifyAdminShadowSession()`。
- `src/lib/admin/service.ts` 已有总览、留存、漏斗、反馈、问卷和规则型 AI insight 雏形；`src/lib/admin/metricsUtils.ts` 已有 DAU/留存/漏斗/Token 纯函数测试。
- analytics 基础表已经具备：`analytics_events`、`analytics_actors`、`actor_sessions`、`actor_daily_activity`、`actor_daily_tokens`、`admin_metrics_daily`、`guest_registry`、`guest_daily_*`。
- `/api/chat` 已写 `chat_action_completed`、`chat_request_finished`、`turn_commit_summary`、`narrative_validator_issue` 等事件，可作为 AI 等待体验和内容质量来源。
- 当前 `scripts/admin-explain-baseline.ts` 已覆盖部分后台慢查询，但仍有旧口径和不完整接口覆盖。

## 本次要补的模块

1. 后台统一鉴权与审计
   - 新增 `src/lib/admin/authGuard.ts`，集中提供 `requireAdminSession()`、`verifyAdminRequest()`、`getAdminActor()`、`assertAdminApiAccess()`。
   - 强化 `src/lib/adminShadow.ts`：随机 nonce、集中 session TTL、cookie 设置说明、禁止 session 值派生 idempotency key。
   - 新增登录失败限流模块，Redis 可用时使用 Redis，不可用时进程内降级。
   - 新增 `ADMIN_CRON_SECRET` 配置，cron 路由只接受 cron secret。
   - 新增 `admin_audit_logs` 表、写入 helper 和只读 API。

2. 指标口径体系
   - 新增 `src/lib/admin/metricDefinitions.ts` 与 `docs/admin-metrics-dictionary.md`。
   - API 返回每个指标的 `metricId`、口径说明、数据来源、`updatedAt`、降级原因。
   - 新增后台专用计算模块，覆盖玩家旅程、AI 等待、内容质量、系统健康、服务端分页用户。

3. 后台 API
   - 新增或重构：
     - `GET /api/admin/overview?range=today|yesterday|7d|30d`
     - `GET /api/admin/player-journey`
     - `GET /api/admin/ai-experience`
     - `GET /api/admin/content-quality`
     - `GET /api/admin/system-health`
     - `GET /api/admin/users`
     - `GET /api/admin/users/[actorKey]`
     - `GET /api/admin/audit-logs`
   - `dashboard-data` 保持兼容，但 `/saiduhsa` 改走服务端分页 `users`，避免全量拉取。

4. 后台 UI
   - `AdminDashboardV2` 改成运营后台信息架构：总览、玩家旅程、AI 等待体验、内容质量、玩家/游客、系统健康、AI 运营助手、审计日志。
   - 每个卡片显示指标口径、数据来源、更新时间、降级状态；局部接口失败只显示该区块降级，不白屏。
   - 玩家表改为服务端分页、筛选、排序，移动端使用卡片/横向安全布局。

5. AI 运营助手
   - 升级 schema：每条建议必须包含 priority、claim、evidenceMetrics、sampleSize、confidence、risk、experiment、expectedImpact、nextAction。
   - 样本不足只能给“证据不足 + 补采建议”，不能输出高置信结论。
   - AI 失败返回本地 fallback，并写审计。

## 数据表和接口变更

### Additive schema

- `admin_audit_logs`
  - `id`
  - `action`
  - `actor`
  - `success`
  - `reason`
  - `ip_hash`
  - `user_agent_hash`
  - `target_type`
  - `target_id`
  - `metadata jsonb`
  - `created_at`
- 索引：`created_at`、`action + created_at`、`actor + created_at`。

### 只读查询来源

- 玩家旅程：`analytics_events`，按 actor、platform、event_name 聚合。
- AI 等待体验：`analytics_events` 的 `chat_request_finished` / `chat_client_perf` payload，以及 `narrative_runs`。
- 内容质量：`analytics_events`、`survey_responses`、`feedbacks`、`narrative_validator_issue`。
- 系统健康：DB ping、Redis ping、AI env 可用性快照、最近 cron 审计、`admin_metrics_daily.updated_at`。
- 用户分页：`users`、`guest_registry`、`actor_daily_tokens`、`user_sessions`、`guest_sessions`、`feedbacks`、`survey_responses`、`settlement_histories`。

## 风险点

- `src/lib/admin/service.ts` 已很大，本次新增服务应拆到独立文件，避免继续膨胀。
- 不能修改 `/api/chat` SSE 契约；若补埋点，只能在客户端或 final hooks 后异步写入。
- `ADMIN_CRON_SECRET` 上线前需要部署环境补变量；未配置时生产 cron 会拒绝执行，这是预期安全变化。
- 本地没有 PostgreSQL/Redis/AI key 时，API、SQL baseline、E2E 可能进入降级或跳过，最终报告必须明确说明。
- Playwright 管理后台测试依赖 `ADMIN_PASSWORD` 构造测试 cookie；session 签名规则变化时必须同步测试 helper。

## 验证命令

- `npx eslint .`
- `pnpm test:unit`
- `pnpm test:ci`
- `pnpm test:admin:api`
- `pnpm test:admin:perf`
- `pnpm analyze:admin-sql`
- `pnpm build`
- 浏览器验收：用 in-app browser 检查 `/saiduhsa` 登录、tab 切换、服务端分页、接口降级、移动端布局。

## 分阶段落地顺序

1. 安全层：统一鉴权、shadow session、登录限流、cron secret、audit log。
2. 数据层：schema/ensureSchema/migration、指标定义、后台查询服务。
3. API 层：新增 endpoints 与旧 endpoint 兼容改造。
4. UI 层：tabs、KPI、玩家分页、系统健康、审计日志、证据型 AI insight。
5. 测试与文档：unit/API/perf/SQL、维护文档、环境文档、浏览器验收。
