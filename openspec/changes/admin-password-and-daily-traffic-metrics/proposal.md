## Why

后台登录口令需要按运营要求轮换，同时后台当前缺少可审计的网页每日访问客流指标。现有分析聚合虽已采用事件驱动，但关键口径需要有回归测试，避免指标随查询或迁移调整而失真。

## What Changes

- 将部署环境中的 `ADMIN_PASSWORD` 轮换为经授权的新值，使新的口令立即生效，旧影子会话失效；口令本身不进入仓库。
- 新增网页访问事件及其按北京时间（Asia/Shanghai）自然日的聚合，分别展示每日页面浏览量（PV）与去重访问者数（UV）。
- 将访问来源以隐私最小化的类别（直接、站内、搜索、社交、其他外部）纳入后台，并让总量与来源分布从同一权威事件口径读取。
- 将每日访问指标纳入后台概览数据和日聚合重建流程，并提供幂等、时区和去重测试。
- 为现有日聚合的关键计数口径补充准确性回归测试，确保重建结果以 append-only analytics event log 与 actor rollup 为准。

## Capabilities

### New Capabilities

- `admin-daily-web-traffic`: 采集并展示按北京时间日统计的网页 PV、UV，并可通过每日重建流程准确回填。
- `admin-metrics-integrity`: 为后台日聚合建立可重复的准确性测试与口径保障。

### Modified Capabilities

- 无。

## Impact

- 认证：只轮换 `ADMIN_PASSWORD` 部署环境值；不修改 shadow-session 格式或管理员 API 鉴权契约。旧 cookie 将因签名密钥变化自动失效。
- Analytics/数据库：扩展 append-only `analytics_events` 的事件 taxonomy，并新增独立的北京时间网页日流量汇总表；迁移采用 `CREATE TABLE IF NOT EXISTS`，旧数据按零值兼容并可按事件日志重建回填。
- API/UI：后台概览返回每日访问客流量、来源分布、趋势和通俗说明；不影响 `/api/chat` SSE/DM JSON、主游戏状态或等待体验。
- 性能：浏览器导航采集为非阻塞、best-effort 请求；不置于 `/api/chat` 首包路径。事件写入失败不阻断页面访问，聚合查询使用按日期和事件的既有索引。
- 灰度/降级：采集以 `VERSECRAFT_ENABLE_WEB_TRAFFIC_ANALYTICS` 开关控制，默认开启；关闭时不发送事件、后台指标返回兼容的零值。
