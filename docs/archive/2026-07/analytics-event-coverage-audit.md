# Analytics Event Coverage Audit

审计日期：2026-05-09

审计范围：

- `src/lib/analytics/types.ts`
- `src/app/actions/telemetry.ts`
- `src/lib/analytics/repository.ts`
- `src/app/api/analytics/heartbeat/route.ts`
- `src/components/home/HomeClient.tsx`
- `docs/admin-metrics-dictionary.md`
- `docs/admin-analytics-maintenance.md`
- 额外用 `rg` 扫描 `src/` 中的事件触发位置。

## 结论

已新增 `src/lib/analytics/eventTaxonomy.ts`，并补充 `src/lib/analytics/eventTaxonomy.test.ts`，保证所有
`AnalyticsEventName` 都被 taxonomy 覆盖。

审计时发现 `/api/chat` 已实际写入两个未进入 union 的事件：

- `lane_side_effect_applied`
- `director_agenda_injected`

本次已将它们加入 `AnalyticsEventName` 和 tracking plan，避免后续类型/文档口径继续漂移。

## 定义了但没有找到触发位置的事件

以下事件存在于 `AnalyticsEventName`，但在 `src/` 业务写入路径中没有找到明确触发位置。这里不把后台查询、文档引用、测试引用算作触发。

| 事件 | 影响 | 建议 |
| --- | --- | --- |
| `world_selected` | 世界选择率无法真实计算 | 在世界选择入口写入，payload 必须含 `worldId` |
| `history_center_viewed` | 历史中心曝光未知 | 在历史中心页面/入口打开时写入 |
| `history_writing_downloaded` | 历史导出使用率未知 | 在下载动作成功后写入，payload 必须含 `format` |
| `settlement_revive_clicked` | 复活意图未知 | 在结算页复活 CTA 点击时写入 |
| `settlement_restart_clicked` | 重开意图未知 | 在结算页重开 CTA 点击时写入 |
| `character_create_started` | 创建页起点缺失，创建成功率分母不准 | 在 `/create` 首次渲染或开始填写时写入 |
| `character_create_success` | legacy 成功事件未触发 | 确认是否废弃；当前实际事件是 `create_character_success` |
| `chat_action_started` | 玩家提交行动起点缺失，失败率分母不完整 | 在客户端提交或服务端收到 action 后写入 |
| `chat_action_failed` | 失败事件缺少结构化写入 | 在 `/api/chat` 可恢复/不可恢复失败 final hook 写入 |
| `chat_stream_first_token` | TTFT 只能从 finished/client_perf 反推 | 可选独立事件；否则从 taxonomy 中标注为 derived |
| `third_effective_action` | 早期留存第三步缺失 | 在 `effective_action` 计数达到 3 时写入一次 |
| `save_created` | 首次存档率缺失 | 在新 slot 创建成功后写入 |
| `settlement_submitted` | legacy 结算提交事件未触发 | 确认是否由 `game_settlement` 替代 |
| `page_hidden_during_generation` | 页面隐藏导致的等待/失败风险不可量化 | 在 `/play` 生成中 visibility hidden 时写入 |

## 核心漏斗事件缺字段风险

| 风险 | 现状 | 后果 | 建议 |
| --- | --- | --- | --- |
| `world_selected` 未触发 | 后台字典把它列为漏斗阶段，但没有业务写入 | 世界选择率、从首页到创建页的转化断层 | 接入世界选择入口，必填 `worldId` |
| `character_create_started` 未触发 | 只有 `create_character_success` 在 `/create` 成功后写入 | 无法区分没进入创建页、进入后放弃、提交失败 | `/create` 首屏或首次编辑写入 started |
| `character_create_success` / `create_character_success` 双命名 | legacy 名称未触发，当前触发的是 `create_character_success` | 后台若只查 legacy 名称会低估创建成功 | 后台查询应兼容两个名称，或迁移到一个 canonical 名 |
| `third_effective_action` 未触发 | `effective_action` 与 `first_effective_action` 已触发 | 第三步留存指标为 0 或不可用 | 在 action count 达 3 时写一次幂等事件 |
| `save_created` 未触发 | `save_sync` / `save_load` 有触发，首存档没有 | 无法衡量首存档建立 | store 或 save action 创建 slot 后写入 |
| `settlement_submitted` 未触发 | `game_settlement` 与 ending 系列事件承担部分结算口径 | legacy 漏斗末端可能偏低 | 明确废弃或在历史提交成功时补写 |
| `chat_action_started` / `chat_action_failed` 未触发 | `chat_request_started` / `chat_request_finished` 已触发 | 用户行动层失败率与 AI 请求层失败率混淆 | 保持 AI 请求事件，同时补玩家行动层 started/failed |

## 游客身份风险

| 风险 | 代码位置 | 说明 | 建议 |
| --- | --- | --- | --- |
| `trackGameplayEvent` 默认无法读取客户端 `guestId` | `src/app/actions/telemetry.ts` | 已增加显式 `guestId` / `userAgent` / `platform` 入参，并统一生成 actor identity；缺 guestId 时只降级标记 `dataQuality.missingGuestId` | 后续事件健康查询可按 `payload.dataQuality.missingGuestId` 追踪残留缺口 |
| `HomeClient` 多数事件未传 `sessionId` | `src/components/home/HomeClient.tsx` | 已统一通过首页 tracking helper 附带 `guestId` 与 `navigator.userAgent`，不再使用共享 `guest_home` 作为游客身份 | 新增首页埋点继续走 helper，避免重新绕开身份补齐 |
| heartbeat 与普通事件身份口径不一致 | `usePresenceHeartbeat` / `trackGameplayEvent` | 普通事件已与 heartbeat 一样按 `buildActorIdentity` 生成 `actorId` / `actorType`，legacy `guest_` session 也会被识别为 guest | 后台继续按 actorId 聚合，sessionId 仅作为访问会话维度 |
| `user_registered` 后游客迁移未串联 | auth action 与首页云同步 | 注册前 guest 行为和注册后 user 行为可能断链 | 注册事件 payload 可加 `previousGuestIdHash`，但不要记录明文 cookie/session |

## platform unknown 风险

| 风险 | 代码位置 | 说明 | 建议 |
| --- | --- | --- | --- |
| `trackGameplayEvent` 使用 `derivePlatformFromUserAgent(null)` | `src/app/actions/telemetry.ts` | 已改为优先使用显式 `platform`，否则从 `userAgent` 推导；HomeClient 已传 `navigator.userAgent` | 其他客户端调用点可逐步补 `userAgent`，未补时仍降级为 `unknown` |
| `admin_login_success` platform 固定 `unknown` | `src/app/actions/admin.ts` | 后台登录平台不可分 | 可从 request header 派生，但不能记录原始 UA 明文 |
| worker/KG 事件 platform 固定 `unknown` | `scripts/vc-worker.ts`, `/api/chat` KG cache | 系统事件本来无客户端平台 | 后台展示时按 system/unknown 单独分桶，不混入玩家平台转化 |
| heartbeat API 可派生 platform，但 server action heartbeat 依赖传入 UA | `src/app/api/analytics/heartbeat/route.ts`, `src/app/actions/telemetry.ts` | 一部分 heartbeat 有平台，一部分没有 | 统一 heartbeat 客户端上报 userAgent 或 platform |

## 后台使用注意

- 新增后台列表接口必须支持 `limit`，默认 20，最大 100。
- 后台 API 失败返回 envelope：`ok / data / degraded / reason`。
- 样本不足统一返回 `reason=insufficient_sample`。
- 不要把 `platform=unknown` 混入 PC/mobile 转化率；应单独展示或标注 degraded。
- AI 成功率以 `chat_request_finished.payload.success` 为主；样本不足时不要输出趋势。
- 内容质量指标以 `narrative_validator_issue`、`narrative_safety_issue`、`turn_commit_summary` 为主，不解析 narrative 明文。
