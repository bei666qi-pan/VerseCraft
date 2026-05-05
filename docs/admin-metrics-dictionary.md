# 后台指标口径字典

## 总览

| id | 中文名 | 业务含义 | 计算口径 | 数据来源 | 刷新频率 | 范围 | 可能降级 | 注意事项 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| overview.new_registered_users.today | 今日新增注册用户 | 注册增长 | 今日 `user_registered` 去重用户数 | `analytics_events` | 实时查询/日聚合 | 注册用户 | 是 | 缺历史事件时为 0 |
| overview.new_guests.today | 今日新增游客 | 首页获客 | 今日首次进入的游客数 | `guest_registry` | 实时查询 | 游客 | 是 | 依赖 guestId |
| overview.active_actors.today | 今日活跃 actor | 真实活跃规模 | 今日活跃 actor 去重 | `analytics_events` | 实时查询 | 全部 | 是 | actorId 缺失时退回 user/guest/session |
| overview.online_registered.current | 当前在线注册用户 | 实时在线 | 10 分钟内 session 心跳用户数 | `user_sessions` | 实时查询 | 注册用户 | 是 | Redis/DB 不可用会降级 |
| overview.online_guests.current | 当前在线游客 | 游客在线 | 10 分钟内游客事件数 | `analytics_events` | 实时查询 | 游客 | 是 | 估算值 |
| overview.effective_actions.today | 今日有效行动数 | 核心玩法使用量 | `effective_action` + `first_effective_action` | `analytics_events` | 实时查询 | 全部 | 是 | 不解析 narrative |
| overview.ai_success_rate.today | 今日 AI 成功率 | AI 主链路健康 | 成功事件 / AI 请求事件 | `analytics_events` | 实时查询 | 全部 | 是 | 样本不足显示 insufficient |
| overview.ai_failure_rate.today | 今日 AI 失败率 | AI 异常规模 | 失败事件 / AI 请求事件 | `analytics_events` | 实时查询 | 全部 | 是 | 与成功率互补 |
| overview.token_cost.today | 今日 Token 成本 | 成本控制 | 今日 token_cost 求和 | `analytics_events` | 实时查询/日聚合 | 全部 | 是 | 依赖事件 token_cost |
| overview.negative_feedback_rate.today | 今日负反馈率 | 用户不满程度 | 负反馈 / 全部反馈 | `feedbacks`、`analytics_events` | 实时查询 | 全部 | 是 | 样本不足不下结论 |

## 玩家旅程漏斗

漏斗顺序：`home_viewed`、`world_selected`、`character_create_started`、`character_create_success`、`enter_main_game`、`first_effective_action`、`third_effective_action`、`save_created`、`settlement_submitted`、`feedback_submitted`。

每个 stage 返回：

- `count`：该步去重 actor 数。
- `stepConversionRate`：当前步 / 上一步。
- `totalConversionRate`：当前步 / 第一步。
- `metricId`：`journey.<eventName>`。

拆分维度：`actorType=all|registered|guest`、`platform=all|pc|mobile`、`range=today|yesterday|7d|30d`。样本小于 20 时 `degraded=true`，原因是 `insufficient_sample`。

## AI 等待体验

| id | 中文名 | 口径 | 数据来源 | 注意事项 |
| --- | --- | --- | --- | --- |
| ai.ttft.p50 | TTFT P50 | `firstTokenMs` 50 分位 | `analytics_events.payload` | 没有首 token 字段时 unavailable |
| ai.ttft.p95 | TTFT P95 | `firstTokenMs` 95 分位 | `analytics_events.payload` | 用于发现长尾等待 |
| ai.total_latency.p50 | 总耗时 P50 | `totalLatencyMs` 50 分位 | `analytics_events.payload` | 包含服务端处理 |
| ai.total_latency.p95 | 总耗时 P95 | `totalLatencyMs` 95 分位 | `analytics_events.payload` | 超预算需要回滚或优化 |
| ai.queue_wait.p50 | 排队等待 P50 | 预留字段 | 当前 unavailable | 未接独立排队体系 |
| ai.success_rate | AI 成功率 | 成功 / 请求 | `chat_request_finished` 等 | 样本不足降级 |
| ai.failure_rate | AI 失败率 | 失败 / 请求 | `chat_action_failed` 等 | 包含可解析失败 |
| ai.fallback_rate | fallback 降级率 | fallback / 请求 | `payload.fallback_used` | 字段缺失时为 0 |
| ai.parse_failure_rate | JSON 解析失败率 | parse/repair failure / 请求 | `payload` | 兼容多种字段名 |
| ai.tokens_per_action | 每行动 Token | token 总量 / 有效行动 | `analytics_events` | 成本分析 |
| ai.tokens_per_actor | 每活跃玩家 Token | token 总量 / 活跃 actor | `analytics_events` | 高成本用户定位 |

## 留存

D1/D3/D7 继续从 `user_daily_activity`、`guest_daily_activity`、`actor_daily_activity` 和 `user_registered` cohort 计算。样本不足时必须显示样本不足，不编造趋势。

## 内容质量

| id | 中文名 | 口径 | 数据来源 |
| --- | --- | --- | --- |
| content.world_selection_rate | 世界观选择率 | `world_selected` 按 worldId 分组 | `analytics_events.payload.worldId` |
| content.chapter_enter_rate | 章节进入率 | 章节事件按 chapterId 分组 | `analytics_events.payload.chapterId` |
| content.chapter_completion_rate | 章节完成率 | 完成 / 进入 | `analytics_events` |
| content.npc_interactions.rank | NPC 互动排行 | NPC 相关 payload 计数 | `analytics_events.payload.npcId` |
| content.validator_issue.count | 规则冲突数 | `narrative_validator_issue` 计数 | `analytics_events` |
| content.retry_or_regen.count | 重试/重新生成次数 | options regen / retry 事件 | `analytics_events` |
| content.negative_feedback_topics | 负反馈主题 | feedback kind/topic 聚合 | `feedbacks` |
| content.survey_sample_size | 问卷样本量 | `survey_submitted` 计数 | `analytics_events` |

## 系统健康

| id | 中文名 | 口径 | 数据来源 | 注意事项 |
| --- | --- | --- | --- | --- |
| health.db | DB 可用性 | `SELECT 1` | PostgreSQL | 不暴露连接串 |
| health.redis | Redis 可用性 | ping 或 fallback 状态 | Redis / memory limiter | 不暴露 URL |
| health.ai_gateway | AI 网关可用性 | 配置存在性 | AI config | 不暴露 key |
| health.cron_freshness | 最近 cron 重建时间 | 审计日志最新 rebuild | `admin_audit_logs` | cron 未跑显示 degraded |
| health.aggregation_freshness | 聚合最新日期 | 最新 `admin_metrics_daily.date_key` | `admin_metrics_daily` | 数据滞后需检查 cron |
| health.recent_errors | 最近错误数 | error/failure 事件数 | `analytics_events` | 只统计元事件 |
| health.deploy_version | 部署版本 | commit sha / node env | 环境变量 | 不含 secret |
