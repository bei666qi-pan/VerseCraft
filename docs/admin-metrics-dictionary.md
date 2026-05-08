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
- `dropOffCount`：当前步到下一步之间流失的 actor 数，最后一步为 0。
- `dropOffRate`：`dropOffCount / 当前步 count`。
- `isBiggestDrop`：当前区间最大流失点，用于后台高亮。
- `metricId`：`journey.<eventName>`。

模式：

- `mode=strict`：严格顺序漏斗。先按 `actor_key + stage` 取最早 `event_time`，再要求 stage N+1 的时间必须大于等于 stage N；顺序错误或跳过前置阶段的 actor 不计入后续阶段。用于判断真实转化与最大流失点。
- `mode=any_order`：任意顺序对照。只要 actor 在区间内出现过该 stage，就计入该 stage；保留旧版简单阶段计数口径，用于和 strict 结果交叉检查事件乱序或补写问题。

拆分维度：`actorType=all|registered|guest`、`platform=all|pc|mobile`、`mode=strict|any_order`、`range=today|yesterday|7d|30d`。样本小于 20 时 `degraded=true`，原因是 `insufficient_sample`。

## 玩家/游客详情

`/api/admin/users/[actorKey]` 用于解释单个注册用户或游客为什么流失、不满或成本偏高。`actorKey` 使用统一 actor 形态：注册用户为 `u:{userId}`，游客为 `g:{guestId}`。游客详情不依赖 `user_id`，优先读取 `guest_registry`，找不到注册表记录时可用 `analytics_events.guest_id/actor_id` 做只读画像兜底。

| 字段 | 口径 | 数据来源 | 限制 |
| --- | --- | --- | --- |
| `basic` | 名称、actor 类型、累计 Token、游玩时长、最近活跃 | `users`、`guest_registry`、`guest_daily_tokens`、`analytics_events` | 只展示尾号/脱敏标识 |
| `journeyStage` | 按核心漏斗顺序定位当前阶段与下一步 | `analytics_events.event_name` | 最近事件最多 30 条 |
| `recentEvents` | 最近事件时间线 | `analytics_events` | `LIMIT 30`，payload 只截取前 8 个结构化键 |
| `contentPath.worlds` | 世界触达路径 | `world_selected/enter_main_game/first_effective_action/chapter_*` | `LIMIT 10` |
| `contentPath.chapters` | 章节进入、完成、放弃 | `chapter_entered/chapter_completed/chapter_abandoned` | `LIMIT 20` |
| `contentPath.npcs` | NPC 互动开始、完成、失败 | `npc_interaction_started/completed/failed` | `LIMIT 20` |
| `aiExperience` | AI 请求数、平均等待、失败数、fallback 数、慢请求数、Token 成本 | `chat_request_finished` | 慢请求阈值为 `totalLatencyMs >= 18000` |
| `feedbackAndSurvey` | 负反馈、负向问卷、存档焦虑计数与最近摘要 | `feedbacks`、`survey_responses` | 各 `LIMIT 5`，开放文本脱敏截断 |
| `riskTags` | `high_ai_cost`、`wait_too_long`、`stuck_before_first_action`、`survey_negative`、`feedback_negative`、`save_anxiety`、`content_quality_risk` | 由上述字段派生 | 仅做运营提示，不自动处罚玩家 |
| `suggestedOpsActions` | 面向运营的下一步建议 | 本地规则 | 不调用 AI，不阻断后台页面 |

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
| ai.rate_limit_count | 429 限流次数 | `rateLimited=true` 或 `httpStatus/upstreamStatus=429` 的 `chat_request_finished` 数量 | `analytics_events.payload` | 包含本地 quota 429 与上游 AI 429 |
| ai.rate_limit_rate | 429 限流率 | 429 限流次数 / `chat_request_finished` 样本数 | `analytics_events.payload` | 用于发现承载或 AI 网关限流压力 |
| ai.tokens_per_action | 每行动 Token | token 总量 / 有效行动 | `analytics_events` | 成本分析 |
| ai.tokens_per_actor | 每活跃玩家 Token | token 总量 / 活跃 actor | `analytics_events` | 高成本用户定位 |

## 留存

D1/D3/D7 继续从 `user_daily_activity`、`guest_daily_activity`、`actor_daily_activity` 和 `user_registered` cohort 计算。样本不足时必须显示样本不足，不编造趋势。

## 内容质量

| id | 中文名 | 口径 | 数据来源 |
| --- | --- | --- | --- |
| content.world_selections.rank | 世界排行 | `world_selected` 按 `payload.worldId|world|world_id` 分组，去重 actor | `analytics_events` |
| content.world_first_action_rate | 世界首行动率 | `first_effective_action` 去重 actor / `world_selected` 去重 actor | `analytics_events` |
| content.chapter_entered | 章节进入数 | `chapter_entered` 按 `worldId + chapterId` 去重 actor | `analytics_events` |
| content.chapter_completed | 章节完成数 | `chapter_completed` 按 `worldId + chapterId` 去重 actor | `analytics_events` |
| content.chapter_completion_rate | 章节完成率 | completed / entered；样本不足时只展示，不判断趋势 | `analytics_events` |
| content.chapter_abandon_rate | 章节放弃率 | `chapter_abandoned` / `chapter_entered` | `analytics_events` |
| content.npc_interactions.rank | NPC 互动排行 | `npc_interaction_started/completed/failed` 按 `npcId|npc_id|targetNpcId` 聚合 | `analytics_events` |
| content.npc_interactions.completion_rate | NPC 互动完成率 | completed / started，失败率为 failed / started | `analytics_events` |
| content.validator_issue.by_code | 规则冲突分类 | `narrative_validator_issue`、`narrative_safety_issue`、`entity_audit_issue`、`pacing_validator_issue` 等 payload.byCode / issueCodes 聚合 | `analytics_events` |
| content.retry_or_regen.count | 重试/重新生成次数 | `retry_clicked + regen_clicked` 真实事件计数 | `analytics_events` |
| content.negative_feedback_topics | 负反馈主题 | feedback kind/topic 聚合 | `feedbacks` |
| content.negative_feedback_rate | 负反馈率 | negativeFeedback / totalFeedback | `feedbacks` |
| content.survey_sample_size | 问卷样本量 | `survey_responses` 区间计数 | `survey_responses` |
| survey.completion_funnel | 问卷完成漏斗 | `survey_entry_exposed -> survey_entry_clicked -> survey_modal_opened -> survey_started -> survey_submit_attempted -> survey_submitted` 按 actor 去重 | `analytics_events` |
| survey.per_question_dropoff | 每题流失 | `survey_step_viewed.payload.stepIndex` 到下一题浏览或提交尝试的去重 actor 差值 | `analytics_events` |
| survey.option_distribution | 选项分布 | `survey_responses.answers` 按题目与选项聚合 | `survey_responses` |
| survey.text_themes | 开放文本主题 | `topFixOne/finalSuggestion/free_text` 用本地规则归类为等待太久、看不懂规则、不知道下一步、文本不稳定、存档担忧、UI 路径复杂、玩法目标不足、其他 | `survey_responses` |
| survey.low_rating_samples | 低评分样本 | `overall_rating<=2` 或 `recommend_score<=4` 的开放文本摘要，邮箱/手机号/长数字脱敏，最长 120 字 | `survey_responses` |
| survey.recommend_distribution | 推荐意愿 | 优先按 `recommend_score` 0-10 分桶；无分数时按 `answers.recommendWillingness` 统计 | `survey_responses` |
| survey.segment_breakdown | 问卷分群 | 注册/游客来自 `user_id/guest_id/client_meta.actorType`；平台来自 `client_meta.platform`；体验阶段来自 `answers.experienceStage` | `survey_responses` |

内容质量样本口径使用上述来源中的最大样本数；最大样本数小于 20 时 API 返回 `degraded=true`、`reason=insufficient_sample`，后台只展示采样缺口，不输出趋势判断。
问卷分析不依赖 AI key；开放文本主题默认使用本地规则 fallback。后台只展示主题计数与截断摘要，不展示完整开放文本，也不输出邮箱、手机号、长数字等敏感明文。

## 数据质量

数据质量面板用于判断当前运营数据是否可信，只基于结构化事件字段，不读取玩家明文输入、完整 narrative、password、session cookie、DATABASE_URL 或 AI key。

| id | 中文名 | 口径 | 数据来源 | 降级/注意事项 |
| --- | --- | --- | --- | --- |
| event_health.total_events | 总事件数 | 区间内 `analytics_events` 总行数 | `analytics_events` | 为 0 时返回结构化空数据，并标记 `insufficient_sample` |
| event_health.invalid_contract_count | 契约异常事件数 | 使用 `eventTaxonomy` 校验 eventName、requiredIdentity、requiredPayloadKeys、敏感字段后的失败数 | `analytics_events` + `src/lib/analytics/eventTaxonomy.ts` | 只输出事件名、字段名和计数，不输出 payload 明文 |
| event_health.missing_actor_count | 缺 actor 数 | `actor_id` 为空的事件数 | `analytics_events.actor_id` | 登录/游客事件都应优先写 actorId；旧事件可能为空 |
| event_health.missing_guest_count | 缺 guest 数 | guest-like 或未登录非系统事件缺 `guest_id`，或 `payload.dataQuality.missingGuestId=true` | `analytics_events.guest_id`, `payload.dataQuality` | 不阻断玩家流程，只作为 event-health 风险 |
| event_health.anon_session_count | anon_session 数 | `session_id='anon_session'` 的事件数 | `analytics_events.session_id` | 游客核心事件应使用 guestId 派生稳定 session |
| event_health.unknown_platform_count | unknown platform 数 | `platform` 为空或 `unknown` 的事件数 | `analytics_events.platform` | 不混入 PC/mobile 转化率 |
| event_health.missing_world_id_count | 缺 worldId 数 | 关键 onboarding/gameplay/save/settlement 事件缺 `payload.worldId|world|world_id` | `analytics_events.payload` | 用于发现核心漏斗无法按世界拆分 |
| event_health.missing_chapter_id_count | 缺 chapterId 数 | 回合、validator、存档类事件缺 `payload.chapterId|chapter_id|currentChapterId|activeChapterId|chapter` | `analytics_events.payload` | 用于发现章节运营分析不可用 |
| event_health.event_coverage | 核心事件覆盖 | `home_viewed -> world_selected -> character_create_success -> enter_main_game -> first_effective_action -> third_effective_action -> save_created -> settlement_submitted -> feedback_submitted` 是否在区间出现 | `analytics_events.event_name` | 样本不足时只显示覆盖，不判断趋势 |
| event_health.top_missing_properties | 缺字段排行 | 契约缺失字段 + actor/guest/session/platform/world/chapter 缺口计数 | 聚合字段名 | 只展示字段名和数量 |

## 后台分析性能与回滚口径

- strict 漏斗依赖 `analytics_events(event_name, event_time)` 先收窄核心事件，再按 `actor_key + stage` 取最早时间；`any_order` 保留旧的区间内出现即计入口径，用来和 strict 对照识别乱序或漏采。
- 数据质量面板依赖 `analytics_events` 的 identity 字段和 taxonomy 校验，不读取玩家明文。`totalEvents < 20` 或核心事件缺失时，必须返回/展示 `insufficient_sample`，不能输出趋势。
- 内容质量按真实事件聚合：世界选择、首行动、章节进入/完成/放弃、NPC 互动、validator issue、retry/regen、反馈和问卷。`chapters`、`npcInteractions` 为空时优先排查事件采集，而不是在后台补假数据。
- 问卷主题使用本地 rule-based fallback：等待太久、看不懂规则、不知道下一步、文本不稳定、存档担忧、UI 路径复杂、玩法目标不足、其他。无 AI key 时仍应可用；低评分样本只展示脱敏截断摘要。
- 新增索引：`analytics_events_event_name_time_idx`、`analytics_events_actor_event_time_idx`、`analytics_events_guest_event_time_idx`、`analytics_events_session_event_time_idx`、`analytics_events_payload_world_id_time_idx`、`survey_responses_created_key_idx`。回滚索引时只 `DROP INDEX IF EXISTS`，不删除 append-only 事件或问卷数据。

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
