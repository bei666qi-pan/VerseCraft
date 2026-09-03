# VerseCraft AI 基础设施

运维入口以 [`docs/ai-gateway.md`](ai-gateway.md) 为准。真实 AI 服务、模型、Key、人民币单价和用途候选统一在 `/admin` → “AI 管理”维护；生产不从环境变量恢复真实服务。

## 目录职责

| 路径 | 职责 |
|------|------|
| `logicalTasks.ts` | 业务语义入口，不绑定厂商和模型名 |
| `tasks/taskPolicy.ts` | TaskType、逻辑角色、安全禁止表和预算 |
| `managed/runtime.ts` | PostgreSQL 配置预热、不可变快照、Redis 失效与五秒轮询 |
| `managed/crypto.ts` | API Key AES-256-GCM 加密与 fail-closed |
| `managed/usage.ts` | Token、调用时人民币单价快照和异步队列 |
| `router/execute.ts` | 按用途候选执行、超时、重试、服务/模型熔断和用量记录 |
| `embeddings/embedText.ts` | OpenAI 兼容及火山多模态向量候选 |
| `gateway/openaiCompatible.ts` | OpenAI Chat Completions 请求体适配 |
| `stream/openaiLike.ts` | SSE / JSON 响应归一 |

## 配置与请求路径

1. 管理员添加服务及模型，系统先做受限真实测试。
2. 全部测试成功后，在一个事务中保存配置并提高 `ai_config_state.version`。
3. 运行实例收到 Redis 失效通知；Redis 不可用时五秒轮询版本。
4. 新请求固定读取启动时的不可变快照，并按运营用途的主用/备用顺序尝试。
5. 成功、失败及向量调用进入本地用量流水；不保存 prompt、玩家输入或 narrative。

## 运营用途与内部兼容角色

| 运营用途 | 典型任务 | 内部角色 |
|----------|----------|----------|
| 玩家故事生成 | `PLAYER_CHAT`、`MECHANICS`、战斗叙事、本地化 | `writer` |
| 规则判断 | 控制预检、意图、安全预检、规则裁决 | `control` |
| 文字润色 | 场景增强、叙事扩写、NPC 情绪润色 | `enhance` |
| 后台推演 | 世界构建、剧情模拟、记忆压缩、离线评测 | `reasoner` |
| 知识检索 | 世界知识向量化和检索 | `reasoner`（兼容字段） |

`PLAYER_CHAT` 继续禁止 `reasoner` / `enhance`。逻辑角色只是安全、telemetry 与旧消费者的兼容字段；真实 URL、Key 和模型名只来自受管快照。

## 降级与测试

- 未完成预热、缺少加密主密钥、解密失败或无故事模型时，`/api/chat` 保持 `200 + SSE`、`keys_missing` status 和权威 final 帧。
- `AI_PROVIDER=mock` 是唯一环境驱动的 AI 路由，仅用于测试、benchmark 和 eval。
- 业务禁止直接读取 AI secret 或散落模型 ID；新增调用经 `logicalTasks` 或 router/embedding 受管入口。
- 验证命令：`pnpm test:e2e:contract`、`pnpm benchmark:chat:mock`，以及后台 AI 管理 E2E。

## 后台任务

`reasoner` 只用于离线任务和 worker。`/api/chat` 终帧后只异步入队 world tick，不等待后台推演返回；Redis 是协调层，长期事实源仍为 PostgreSQL。
