# VerseCraft Analytics Tracking Plan

本文件定义 VerseCraft 事件埋点的产品口径。机器可校验契约位于 `src/lib/analytics/eventTaxonomy.ts`，并由
`src/lib/analytics/eventTaxonomy.test.ts` 保证所有 `AnalyticsEventName` 都有 contract。

## 全局约定

- 写入表：`analytics_events`。
- 事件写入失败必须 best-effort，不阻断玩家主流程。
- 不记录明文 `password`、session cookie、`DATABASE_URL`、AI key/API key、authorization token、secret。
- 每个事件至少应有稳定 `sessionId`；注册/登录成功事件还应有 `userId`。
- 游客事件应优先携带 `guestId`，否则后台只能退化为 session 级估算。
- 平台字段应来自 user-agent 或客户端明确上报；无法识别时为 `unknown`，后台需要单独展示。
- 样本不足时后台返回 `degraded=true`、`reason=insufficient_sample`，不能推断趋势。

## Contract 字段

每个事件在 `ANALYTICS_EVENT_TAXONOMY` 中都有：

- `eventName`：必须等于 `AnalyticsEventName`。
- `category`：`acquisition | auth | onboarding | gameplay | ai | save | survey | feedback | content_quality | admin | health`。
- `requiredIdentity`：从 `actorId | userId | guestId | sessionId` 中声明该事件最低身份字段。
- `requiredPayloadKeys`：后台计算必需 payload 字段。
- `optionalPayloadKeys`：推荐但非强制字段。
- `version`：事件 contract 版本。
- `owner`：维护负责人域。

`validateAnalyticsEventContract(input)` 可用于后续写入前校验，返回：

- `ok`
- `degraded`
- `reason`: `ok | unknown_event | missing_identity | missing_payload_keys | sensitive_payload_keys`
- `missingIdentity`
- `missingPayloadKeys`
- `sensitivePayloadKeys`

## 核心漏斗事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `home_viewed` | `src/components/home/HomeClient.tsx` 首页首次渲染 | `entryState` | 首页曝光、入口状态分布、漏斗第一步 |
| `home_auth_clicked` | `HomeClient` 登录/注册入口 | `entryState` | 注册意图、游客转化前置行为 |
| `home_start_new_clicked` | `HomeClient` 新开局 CTA | `entryState` | 开局意图、首页转化 |
| `home_continue_clicked` | `HomeClient` 继续阅读/游玩 CTA | `entryState` | 续玩意图、存档可用性 |
| `home_continue_resolved` | `HomeClient` 续玩目标解析后 | `resolution` | 续玩链路健康、云/本地/影子存档命中 |
| `world_selected` | 待接入 | `worldId` | 世界选择转化、内容入口分析 |
| `character_create_started` | 待接入 | `source` | 创建页进入率 |
| `create_character_success` | `src/app/create/CreateCharacterForm.tsx` | `name`, `gender`, `height` | 创建成功率、进入 `/play` 前一步 |
| `enter_main_game` | `src/app/play/page.tsx` | `source` | `/play` 到达率 |
| `first_effective_action` | `src/app/play/page.tsx` 首次有效行动 | `actionCount` | 激活率、首回合完成率 |
| `third_effective_action` | 待接入 | `actionCount` | 早期留存质量，不足时不可推断 |
| `effective_action` | `src/app/play/page.tsx` 每次有效行动 | `actionCount` | 活跃深度、行动量 |
| `save_created` | 待接入 | `slotId` | 首存档率 |
| `settlement_submitted` | 待接入 | `outcome` | 结局/死亡提交率 |
| `feedback_submitted` | `src/app/actions/feedback.ts` | `source` | 反馈率、负向反馈分母 |

注意：`character_create_success` 是 legacy 事件名，目前实际成功事件是 `create_character_success`。

## Auth 事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `auth_modal_opened` | `HomeClient` | `mode` | 认证弹窗曝光 |
| `auth_mode_switched` | `HomeClient` | `fromMode`, `toMode` | 登录/注册切换摩擦 |
| `auth_submit_attempted` | `HomeClient` | `mode` | 认证提交意图 |
| `auth_submit_failed` | `HomeClient` / auth state effect | `mode`, `reason` | 登录/注册失败率 |
| `user_registered` | `src/app/actions/auth.ts` | 无 | 注册成功、新用户口径 |
| `user_login_success` | `src/app/actions/auth.ts` | 无 | 登录成功、回访用户口径 |

## Gameplay / Ending 事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `chat_action_started` | 待接入 | `requestId` | 玩家提交行动起点 |
| `chat_action_completed` | `src/app/api/chat/route.ts` | `requestId` | 有效 AI 回合、成本/时长 rollup |
| `chat_action_failed` | 待接入 | `requestId`, `reason` | 主链路失败率 |
| `settlement_viewed` | `src/app/settlement/page.tsx` | `source` | 结算页到达 |
| `settlement_export_clicked` | `src/app/settlement/page.tsx` | `format` | 导出使用率 |
| `settlement_revive_clicked` | 待接入 | `outcome` | 复活意图 |
| `settlement_restart_clicked` | 待接入 | `outcome` | 重开意图 |
| `game_settlement` | `src/app/actions/history.ts` | `settlementId` | 历史结算入库 |
| `ending_eligible_detected` | `src/app/play/page.tsx` | `runId`, `endingPhase` | 结局资格检测 |
| `ending_final_choice_shown` | `src/app/play/page.tsx` | `runId`, `endingPhase` | 最终选择曝光 |
| `ending_final_choice_selected` | `src/app/play/page.tsx` | `runId`, `outcome` | 结局选择 |
| `ending_final_narrative_committed` | `src/app/play/page.tsx` | `runId`, `outcome` | 终局叙事提交 |
| `ending_settlement_snapshot_created` | `src/app/play/page.tsx` | `runId`, `settlementId` | 结算快照创建 |
| `ending_redirected_to_settlement` | `src/app/play/page.tsx` | `runId`, `settlementId` | 跳转链路 |
| `ending_settlement_viewed` | `src/app/settlement/page.tsx` | `runId` | 结局页查看 |
| `ending_settlement_history_submitted` | `src/app/settlement/page.tsx` | `runId`, `settlementId` | 结局历史提交 |
| `ending_blocked` | `src/app/play/page.tsx`, `src/app/settlement/page.tsx` | `runId`, `blockers` | 结局阻塞原因 |

## AI / Realtime 事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `chat_request_started` | `src/app/api/chat/route.ts` | `requestId` | 服务端主请求起点 |
| `chat_stream_first_token` | 待接入 | `requestId`, `firstTokenMs` | TTFT 独立事件，目前用 `chat_request_finished` / `chat_client_perf` 替代 |
| `chat_request_finished` | `src/app/api/chat/route.ts` | `requestId`, `success`, `totalLatencyMs` | AI 成功率、延迟、token、fallback、prompt 预算 |
| `chat_client_perf` | `src/app/play/page.tsx` | `requestId` | 客户端感知等待、SSE frame 质量 |
| `page_hidden_during_generation` | 待接入 | `requestId` | 页面隐藏导致生成体验风险 |
| `turn_lane_decided` | `src/app/api/chat/route.ts` | `requestId`, `lane`, `reasons` | lane routing 分布 |
| `lane_side_effect_applied` | `src/app/api/chat/route.ts` | `requestId`, `lane` | lane 副作用实际应用 |

## Save / History 事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `save_sync` | `src/app/actions/save.ts` | `slotId` | 云存档同步 |
| `save_load` | `src/app/actions/save.ts` | `slotId` | 云存档加载 |
| `history_center_viewed` | 待接入 | 无 | 历史中心曝光 |
| `history_writing_downloaded` | 待接入 | `format` | 历史文本导出 |

## Survey / Feedback 事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `survey_entry_exposed` | `HomeClient` | `placement` | 问卷入口曝光 |
| `survey_entry_clicked` | `HomeClient` | `placement` | 问卷入口点击 |
| `survey_modal_opened` | `HomeClient` | `mode` | 问卷弹窗打开 |
| `survey_started` | `HomeClient` | `surveyKey`, `version` | 问卷开始 |
| `survey_step_viewed` | `HomeClient` | `surveyKey`, `version`, `questionId`, `stepIndex` | 问卷步骤漏斗 |
| `survey_step_next` | `HomeClient` | `surveyKey`, `version`, `questionId`, `fromStepIndex` | 步骤前进 |
| `survey_step_prev` | `HomeClient` | `surveyKey`, `version`, `questionId`, `fromStepIndex` | 步骤回退 |
| `survey_submit_attempted` | `HomeClient` | `surveyKey`, `version` | 提交尝试 |
| `survey_submit_failed` | `HomeClient` | `surveyKey`, `version`, `reason` | 提交失败 |
| `survey_exit` | `HomeClient` | `surveyKey`, `version`, `stepIndex` | 问卷退出 |
| `survey_submitted` | `src/app/actions/feedback.ts` | `surveyKey`, `version` | 问卷成功提交 |
| `survey_external_link_opened` | `HomeClient` | `surveyKey`, `version` | 外部问卷跳转 |
| `feedback_submit_attempted` | `HomeClient` | `source` | 反馈提交尝试 |
| `feedback_submit_failed` | `HomeClient` | `source`, `reason` | 反馈提交失败 |
| `compliance_inquiry_submitted` | `src/app/actions/complianceInquiry.ts` | `topic` | 合规咨询 |

## Content Quality / Safety 事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `world_engine_enqueued` | `src/app/api/chat/route.ts` | `requestId`, `jobId` | 后台世界推进入队 |
| `director_agenda_injected` | `src/app/api/chat/route.ts` | `requestId`, `agendaCount` | 导演议程注入 |
| `social_world_hint_projected` | `src/app/api/chat/route.ts` | `requestId`, `projectedCount` | 社交世界 hint 投放 |
| `turn_commit_summary` | `src/app/api/chat/route.ts` | `requestId` | 回合提交摘要 |
| `narrative_validator_issue` | `src/app/api/chat/route.ts` | `requestId`, `issueCodes` | 生成后 validator 问题 |
| `narrative_protocol_leak` | `src/app/api/chat/route.ts` | `requestId`, `issueCode` | 协议泄漏 |
| `narrative_safety_commit` | `src/lib/turnEngine/narrativeSafety/telemetry.ts` | `requestId`, `decision` | 安全决策 |
| `narrative_safety_issue` | `src/lib/turnEngine/narrativeSafety/telemetry.ts` | `requestId`, `issueCodes` | 安全问题 |
| `entity_audit_issue` | `src/lib/turnEngine/narrativeSafety/telemetry.ts` | `requestId`, `issueCodes` | 实体边界问题 |
| `pacing_validator_issue` | `src/lib/turnEngine/narrativeSafety/telemetry.ts` | `requestId`, `issueCodes` | 节奏问题 |
| `safety_fallback_used` | `src/lib/turnEngine/narrativeSafety/telemetry.ts` | `requestId`, `decision` | 安全 fallback |
| `unknown_entity_blocked` | `src/lib/turnEngine/narrativeSafety/telemetry.ts` | `requestId`, `issueCodes` | 未知实体阻断 |
| `prompt_injection_blocked` | `src/lib/turnEngine/narrativeSafety/telemetry.ts` | `requestId`, `issueCodes` | 注入阻断 |

## Admin / Health / KG 事件

| 事件 | 触发位置 | 必填 payload | 后台用途 |
| --- | --- | --- | --- |
| `admin_login_success` | `src/app/actions/admin.ts` | 无 | 后台登录审计辅助 |
| `session_heartbeat` | `src/app/actions/telemetry.ts`, `src/app/api/analytics/heartbeat/route.ts` | 无 | 在线、停留、活跃时长 |
| `presence_flaky` | `src/lib/presence.ts` | `reason` | 在线状态异常 |
| `kg_cache_hit` | `src/app/api/chat/route.ts` | `cacheKey` | KG cache 命中 |
| `kg_cache_miss` | `src/app/api/chat/route.ts` | `cacheKey` | KG cache 未命中 |
| `kg_cache_write` | `src/app/api/chat/route.ts` | `cacheKey` | KG cache 写入 |
| `kg_job_claimed` | `scripts/vc-worker.ts` | `jobId`, `jobType`, `attempts` | worker 消费 |
| `kg_job_succeeded` | `scripts/vc-worker.ts` | `jobId`, `jobType`, `attempts` | worker 成功率 |
| `kg_job_failed` | `scripts/vc-worker.ts` | `jobId`, `jobType`, `attempts` | worker 失败率 |
