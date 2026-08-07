## ADDED Requirements

### Requirement: Dashboard 新增第 10 个 Tab

`AdminDashboardV2.tsx` SHALL 新增「Langfuse 可观测」Tab，位于现有 9 个 Tab 之后。Tab 使用 `Activity` 图标，UI 风格沿用现有 Tailwind 设计语言（`bg-[#174d46]`、`text-[#fffaf0]`、`Card`、`KpiGrid`、`Panel`、`SectionTitle`）。Tab 在 Langfuse 不可用时 MUST 仍可见，显示降级状态而非隐藏。

#### Scenario: Tab 正常渲染
- **WHEN** 用户切换到「Langfuse 可观测」Tab
- **THEN** 显示 5 个子面板（Trace 浏览器、Score 趋势、模型性能、成本仪表盘、健康检查）

#### Scenario: Langfuse 不可用时降级
- **WHEN** `VERSECRAFT_ENABLE_LANGFUSE_READ=false` 或 Langfuse API 不可达
- **THEN** Tab 仍可切换，各面板显示"数据不可用"降级提示，不显示空白或报错

### Requirement: Trace 浏览器子面板

Trace 浏览器 SHALL 提供搜索框 + 过滤器（模型、lane、日期范围）+ 分页表格。表格显示 trace ID（截断至前 12 字符）、时间、模型、延迟、Token、状态、Scores。点击行 MUST 展开 Trace Detail 面板，以瀑布图形式展示 observations 嵌套时间线。

#### Scenario: 搜索与过滤
- **WHEN** 用户输入搜索关键词并选择模型过滤
- **THEN** 表格更新为匹配的 trace 列表

#### Scenario: Trace 详情展开
- **WHEN** 用户点击某 trace 行
- **THEN** 展开区域显示 observation 瀑布图（嵌套时间线，每层缩进表示父子关系）

### Requirement: Score 趋势子面板

Score 趋势面板 SHALL 提供按 metric 分组的折线图（使用 Tailwind 柱状图模拟）和时间范围选择器（今日/7d/30d）。默认显示 `contract_valid`、`turn_committed`、`ttft_ms`、`final_latency_ms` 四个核心 score。

#### Scenario: 时间范围切换
- **WHEN** 用户选择「30d」
- **THEN** 图表更新为 30 天内的 score 每日平均趋势

### Requirement: 模型性能子面板

模型性能面板 SHALL 按模型分组显示卡片：p50/p95 延迟、成功率、平均 Token/请求、估算成本。同时按 AI 角色（main/control/enhance/reasoner）分组展示。

#### Scenario: 模型卡片渲染
- **WHEN** 数据加载成功
- **THEN** 每个模型渲染一张卡片，显示延迟分位数和成功率

### Requirement: 成本仪表盘子面板

成本仪表盘 SHALL 显示按模型+角色的成本饼图（Tailwind 分段柱状图模拟）和日成本趋势线。

#### Scenario: 成本分布可视化
- **WHEN** 数据加载成功
- **THEN** 显示各模型成本占比的分段柱状图和日趋势

### Requirement: 健康检查子面板

健康检查面板 SHALL 显示 Langfuse 连接状态（绿色/红色指示灯）、最近 ingestion 时间、导出错误计数。

#### Scenario: 健康状态展示
- **WHEN** Langfuse API 正常
- **THEN** 显示绿色「已连接」状态 + 最近 ingestion 时间

#### Scenario: 不健康状态展示
- **WHEN** Langfuse API 不可达
- **THEN** 显示红色「未连接」状态 + 导出错误计数

### Requirement: 数据获取与刷新

Dashboard SHALL 在切换到「Langfuse 可观测」Tab 时并行拉取 6 个 API 端点的数据，使用现有 `fetchEnvelope` 模式。SHALL 提供手动刷新按钮。

#### Scenario: Tab 切换时加载
- **WHEN** 用户首次切换到「Langfuse 可观测」Tab
- **THEN** 并行发起 6 个 fetch 请求，各面板显示加载状态

#### Scenario: 手动刷新
- **WHEN** 用户点击刷新按钮
- **THEN** 重新拉取所有面板数据

### Requirement: 移动端视口适配

「Langfuse 可观测」Tab SHALL 在 `390×844`、`393×852`、`430×932` 视口下正常渲染，表格支持横向滚动，瀑布图在窄屏下堆叠显示。

#### Scenario: 移动端渲染
- **WHEN** 视口宽度为 390px
- **THEN** 所有面板可正常交互，Trace 表格支持横向滚动
