# 后台统计与AI洞察维护说明

## 指标口径定义位置
- 核心口径聚合与读取：`src/lib/admin/service.ts`
- 日级重建口径：`src/lib/analytics/aggregation.ts`
- 可测试口径工具：`src/lib/admin/metricsUtils.ts`

## 埋点接入位置
- 聊天与耗时/Token：`src/app/api/chat/route.ts`
- 注册/登录：`src/app/actions/auth.ts`
- 反馈：`src/app/actions/feedback.ts`
- 结算与战绩：`src/app/actions/leaderboard.ts`
- 心跳与在线：`src/app/actions/telemetry.ts` + `src/lib/presence.ts`
- 通用落库：`src/lib/analytics/repository.ts`

## 聚合在哪里跑
- 写入时增量聚合：`src/lib/analytics/repository.ts`（CTE 原子更新）
- 定时重建入口：`src/app/api/admin/cron/rebuild-daily/route.ts`
- 重建逻辑：`src/lib/analytics/aggregation.ts`

## AI 洞察如何生成
- 输入构建与降级：`src/lib/admin/aiInsights.ts`
- 输出 schema 校验：`src/lib/admin/aiInsightSchema.ts`
- API：`src/app/api/admin/ai-insights/route.ts`
- 管理台触发入口：`src/components/admin/AdminDashboardV2.tsx`

## 验证命令
- 单测：`pnpm test:unit`
- 类型：`pnpm exec tsc -p tsconfig.json --noEmit`
- Lint：`npx eslint .`
- 后台接口集成测试：`pnpm test:admin:api`
- 后台渲染平滑回归：`pnpm test:admin:perf`
- SQL 执行计划基线：`pnpm analyze:admin-sql`（CI 门槛模式：`pnpm analyze:admin-sql:strict`）

## 接口集成测试覆盖
- 鉴权拒绝：未携带 `admin_shadow_session` 时，`/api/admin/*` 返回 403。
- 鉴权通过：构造有效 shadow cookie 后，`overview/realtime/ai-insights` 至少返回 `200|500`（500 必须是降级结构，不允许崩溃）。
- AI 生成接口：`POST /api/admin/ai-insights` 走结构化输出或降级输出，禁止返回无结构响应。

## SQL 基线门槛（可调）
- `realtime_active_sessions`：120ms
- `latest_feedback_distinct_on`：180ms
- `latest_game_distinct_on`：180ms
- `events_trend_60m`：120ms
- `funnel_grouped`：150ms

若 `--strict` 下超过门槛，脚本退出码为 2，建议在 CI 中阻断上线。

## 前端平滑性回归指标
- 场景：`/saiduhsa` 首屏渲染 + 自动数据刷新周期。
- 指标：
  - FPS >= 20
  - 最大 Long Task < 400ms
  - Long Task 数量 < 20（7 秒窗口）
- 同时断言页面无 `pageerror`。

## 已知降级策略
- Redis 不可用：在线人数降级为 0，不阻断主流程。
- AI 调用失败/格式不合法：返回本地降级报告，不影响其他面板。
- 历史事件不足：AI 输出必须标记“证据不足”。

