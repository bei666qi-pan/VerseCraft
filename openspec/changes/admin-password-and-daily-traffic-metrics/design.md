## Context

管理员 shadow session 由 `ADMIN_PASSWORD` 作为 HMAC 密钥签发；轮换该环境变量会自然撤销既有 cookie。后台的日指标由 `analytics_events`（append-only、idempotency key 去重）和 actor rollup 重建到 `admin_metrics_daily`，但目前没有全站访问量字段，也缺少针对聚合计算的可重复验证。

## Goals / Non-Goals

**Goals:**

- 在不改变管理员鉴权协议的前提下安全轮换生产 `ADMIN_PASSWORD`。
- 用非阻塞、可开关的客户端导航事件采集 PV 与每日去重 UV。
- 将访问量写入既有 event log，且由日重建任务以北京时间日期准确、幂等地回填到持久化日报。
- 通过纯函数单元测试和 API/数据库契约测试保障计数、去重、日期边界与开关降级。

**Non-Goals:**

- 不采集 IP、用户代理明文、页面标题、查询参数或其他可识别内容。
- 不更改 `/api/chat`、SSE、游戏 store、AI 路由或后台世界推进。
- 不改造整个后台指标体系，也不变更 shadow-session 的 cookie 名、有效期或签名格式。

## Decisions

1. **将 `page_viewed` 写入既有 `analytics_events`，而非新建访问日志表。**
   事件表已有幂等、环境标记和时间索引，且日重建以其为事实源。每次客户端路由进入生成一个页面浏览 event；UV 以同一北京时间日中稳定的匿名 `visitorId` 去重。替代方案是 CDN/访问日志统计，但其身份和时区口径不能与产品指标可靠对齐。

2. **客户端只上报规范化 pathname 和随机持久 visitorId。**
   tracker 使用浏览器 localStorage 创建随机 UUID，不提交 URL query/hash，也不采集原始 UA/IP。每次页面进入带随机 event ID，服务端以 event ID 幂等。替代方案是用 cookie/IP 去重；前者增加服务端状态与同意管理成本，后者既不稳定也不满足隐私最小化。

3. **通过专用 `/api/analytics/page-view` 路由接收事件。**
   路由负责长度/路径校验、feature flag 和 `recordGenericAnalyticsEvent` 调用，响应永远不影响页面渲染。客户端以 `keepalive` best-effort `fetch` 发送。替代方案是 Server Action；其对页面导航的耦合更强，也难以在根布局统一采集。

4. **将流量汇总独立存入 `web_traffic_daily`。**
   该表的 `date_key` 明确是北京时间日期，`rebuildWebTrafficDailyForDateKey` 对目标北京日的 `page_viewed` 做 `COUNT(*)` 和 `COUNT(DISTINCT payload->>'visitorId')`，并全量覆盖。这不改变现有 `admin_metrics_daily` 的 UTC 历史口径，却能让新流量指标严格按中国用户的自然日呈现。替代方案是修改既有日报的日期语义；它会破坏现有 DAU、token、幂等键和历史趋势兼容。

5. **网页客流指标日界统一使用北京时间（Asia/Shanghai）。**
   访问采集事件时间由服务端生成，日重建以 `event_time AT TIME ZONE 'Asia/Shanghai'` 过滤。后台说明必须明确“北京时间”；既有 `admin_metrics_daily` 和 actor rollup 保持原有 UTC 语义，避免把兼容性改动混入本次变更。

6. **通过 `VERSECRAFT_ENABLE_WEB_TRAFFIC_ANALYTICS` 灰度开关控制采集。**
   默认开启；关闭时 API 仅返回 `{ ok: true, skipped: true }`，后台读取零值/已有历史值，不抛错。该开关读取遵从配置层单一入口。

7. **来源只记录隐私最小化类别，且总量与来源用同一 event-log 查询计算。**
   客户端将 `document.referrer` 分类为 direct、internal、search、social 或 referral；不上传原始 referrer、域名、查询参数或 UTM 原文。后台“今日”PV/UV和来源分布都直接从 append-only `analytics_events.page_viewed` 查询，以避免日汇总任务尚未运行时显示过期数据；日报表仍作为回填和趋势缓存。SQL 复用与 API 相同的 visitorId 有效性规则，避免无效历史 payload 被算进 UV。

## Risks / Trade-offs

- [浏览器阻止或中断 best-effort 请求] → PV/UV 是产品事件口径，不承诺等同于 CDN 请求量；后台注明采集口径，客户端使用 keepalive 且失败不影响访问。
- [同一用户跨浏览器/清理存储] → UV 定义为“稳定匿名浏览器 visitorId”，不声称是跨设备真人数。
- [部署前旧数据库缺字段] → migration 和 runtime schema 使用 `ADD COLUMN IF NOT EXISTS`；读取缺字段的错误降级到零值，部署后可调用 rebuild cron 回填。
- [重复上报] → event ID 与 idempotency key 同值，event insert 冲突后不产生第二条记录；日重建以覆盖写入确保幂等。
- [来源分类被伪造或浏览器省略 referrer] → 该指标明确是“浏览器上报的来源类别”，direct/unknown 不被解释为自然流量；不以它做认证或安全决策。
- [口令传播或仓库泄露] → 新值仅通过安全渠道注入生产部署环境，不写入源码、测试 fixture、`.env.example`、设计文档或日志。

## Migration Plan

1. 增加 schema、migration/runtime ensure、taxonomy、采集路由与后台读取。
2. 在部署前通过安全渠道更新 Coolify 的 `ADMIN_PASSWORD`，保留独立 `ADMIN_CRON_SECRET`。
3. 部署时运行既有 migration，确认新字段存在；启用 `VERSECRAFT_ENABLE_WEB_TRAFFIC_ANALYTICS=true`。
4. 运行当日与近期北京时间日期的 rebuild daily cron/管理员端点，以已有 `page_viewed` 事件回填（上线前没有事件的日期维持零值）。
5. 验证新的密码可登录、旧 cookie 得到 401，以及 dashboard 中 PV/UV 与 SQL 事件计数一致。
6. 回滚时回退应用与 feature flag；新增列保留（向后兼容），将 `ADMIN_PASSWORD` 设回已获授权的旧值会使当前 shadow session 失效并重新签发。

## Open Questions

- 无；“客流量”按每日 PV（浏览次数）和 UV（匿名浏览器访问者数）同时呈现，日界为北京时间。
