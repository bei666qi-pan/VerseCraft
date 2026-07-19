## Why

现有 live mechanics campaign 在职业试炼完成后直接在测试脚本中调用 `certifyProfession` 并改写快照，因此“职业已认证”的绿灯不是玩家真实经过任务、资格判断和认证动作得到的证据。与此同时，后台 World Director 的 worker 路径依赖 PostgreSQL job queue；当前本机数据库不可用，不能把纯单测或模型输出当成“导演已实际发挥作用”。

现在需要把任务、职业和导演的验收改为可追溯的真实链路，宁可明确报告环境阻塞，也不能用 harness 补丁制造高置信。

## What Changes

- 移除 live mechanics campaign 中回合后人工认证职业的 reducer；职业证据改为 DM 驱动的任务状态/资格状态与真实 store 认证动作的分层验证。
- 为任务完成、职业资格、单职业认证和非法跳过补充纯函数 / store 集成测试，以及仅计入真实 `/api/chat` 结构化结果的 live report。
- 收紧 live weapon objective：仅“持有武器”不得通过，必须证明真实 final state 发生与战斗一致的耐久变化。
- 对有物品交付前提的 legacy 任务，强制核对结构化行囊；缺少登记物品时不得凭空叙事或完成任务。
- 为 World Director 增加可执行的端到端验证入口：入队、worker claim、真实 reasoner JSON、validator、agenda / director-state 持久化以及后续回合可消费的证据必须全部存在才可报告导演有效。
- 让文档化的 standalone worker 在本地启动时加载 `.env.local`；这与 Next 开发进程的配置行为对齐，避免已有可用数据库仅被 web 进程读取、后台导演却因缺失 `DATABASE_URL` 退出。
- 当 PostgreSQL、worker 或网关缺失时，输出明确 `inconclusive` / 环境阻塞报告；不得将 fixture 或内存模拟记为 production director evidence。

## Capabilities

### New Capabilities

- `real-mechanics-director-evidence`: 以真实状态提交和后台 worker 为边界，验证任务、职业和 World Director 的可玩性证据链。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：`scripts/run-live-mechanics-campaign.ts`、playthrough harness / report、职业与任务状态测试、world engine queue / standalone worker 验证脚本及其文档。
- 不改变 `/api/chat` SSE / `__VERSECRAFT_FINAL__` 契约，不改数据库 schema、analytics 事件名称或客户端存档格式。在线回合仍只 enqueue 后台 tick，不把 reasoner、DB 写入或 worker 等待放进首字前路径。
- 后台导演验证将实际依赖既有 PostgreSQL、job queue、worker 和 one-api。所有 live 路径须保留现有 feature flag / enabled 配置；无依赖时安全失败并报告证据缺口。
