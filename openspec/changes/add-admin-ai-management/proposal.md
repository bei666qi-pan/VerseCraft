## Why

VerseCraft 的 AI 密钥、模型映射和成本观测仍依赖部署环境与 NewAPI/one-api，运营人员无法在站内安全换 Key、配置主备或查看全部 AI 调用的真实用量。需要把服务配置、路由和用量事实源收回应用自身，同时把后台从技术指标集合收敛为可理解、可操作的运营工具。

## What Changes

- 新增数据库驱动的多 AI 服务、服务下多模型、用途主备排序和热更新能力，密钥使用部署主密钥加密且永不回显。
- 新增全部生成与向量调用的 90 天明细、长期每日汇总、人民币单价快照和后台趋势/排行。
- 新增管理员服务增改、测试、启停、软删除与路由排序 API，所有写操作鉴权、限流并审计。
- 将后台导航收敛为“运营概览、AI 管理、玩家与反馈、系统状态”，默认隐藏技术标识与底层错误。
- **BREAKING**：生产运行时不再读取 `AI_GATEWAY_*`、`AI_MODEL_*`、`VC_AI_DIRECT_*`、Kimi 或 `ARK_EMBEDDING_*` 作为真实服务配置；部署必须设置 `AI_CONFIG_ENCRYPTION_KEY` 并在后台录入服务。
- 保留 `AI_PROVIDER=mock` 供测试，保留 `/api/chat` 的 SSE、status/final 帧和 `keys_missing` 降级契约。

## Capabilities

### New Capabilities

- `admin-ai-service-management`: AI 服务、模型、加密密钥、连接测试、用途主备与管理员操作契约。
- `ai-usage-ledger`: 全部 AI/向量调用的幂等用量明细、人民币费用、每日汇总与保留策略。
- `simplified-admin-console`: 四入口后台、通俗状态与响应式 AI 管理工作流。

### Modified Capabilities

- `admin-metrics-integrity`: AI 消耗展示新增独立用量事实源，同时保持既有 analytics 事件和统计口径兼容。
- `dark-moon-only-world`: 真实 AI 配置来源改为后台服务配置；缺少配置时仍使用原有可解析 SSE 降级。

## Impact

- 数据库：新增六张 AI 配置/用量表、迁移、运行时建表兼容与清理汇总任务。
- AI：修改配置解析、router 候选解析、服务/模型熔断、embedding 绑定与 telemetry；不改变 TaskType、DM JSON、prompt、安全 validator 或状态提交。
- API/UI：新增管理员 AI 管理接口并重构 `/saiduhsa` 后台信息架构。
- 性能：配置通过内存快照读取，用量异步写入；首状态和首字路径不新增同步数据库写入。配置不可用时 fail-closed。
- 发布：属于硬切换，旧环境变量不作为生产兜底；未录入健康故事模型期间返回现有 `keys_missing` SSE。

