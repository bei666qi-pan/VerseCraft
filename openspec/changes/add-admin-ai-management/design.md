## Context

现有 AI router 把所有真实请求解析为单个 OpenAI-compatible gateway URL、Key 和按逻辑角色命名的模型；用量主要进入日志、短期 Redis ring 及玩家回合 analytics。后台已有丰富指标，但导航过细且暴露角色、来源和延迟分位等技术概念。配置与观测必须迁入应用，同时保护在线 SSE、状态提交、安全治理和延迟预算。

## Goals / Non-Goals

**Goals:**

- 数据库安全保存多个服务、多个模型和用途主备顺序，并在测试成功后热生效。
- 统一记录生成与向量调用的 Token、人民币预估费用、结果与每日汇总。
- 让非技术运营者在四个入口内完成 AI 运维与基本业务观察。
- 删除生产真实调用对 NewAPI/one-api 和旧 AI 环境变量的依赖。

**Non-Goals:**

- 不实现供应商账户余额、账单对账或厂商专属管理 API。
- 不修改 DM JSON、prompt 内容、validator、resolveDmTurn、玩家配额或主 store。
- 不把 Langfuse、analytics 或 Redis 变成配置真相源。

## Decisions

1. **配置真相源使用 PostgreSQL，运行时使用不可变内存快照。** 六张表分别承载服务、模型、路由、版本、明细和每日汇总。实例启动预热；后台写入后增加版本并发布 Redis 失效消息，5 秒轮询兜底。每次 AI 请求只读取内存，避免首字前 DB I/O。相比更新环境变量并重启，这支持原子热切换和多实例一致性。
2. **密钥以应用层 AES-256-GCM 加密。** `AI_CONFIG_ENCRYPTION_KEY` 接受 base64 或 64 位 hex 的 32 字节密钥；每条记录使用随机 12 字节 IV、16 字节 tag 和稳定记录 ID 作为 AAD。缺密钥、解密或认证失败均 fail-closed。相比数据库扩展或可回显 secrets，这不增加基础设施依赖且保持最小暴露面。
3. **公开 API 使用运营用途，内部适配现有角色。** 后台只显示故事生成、规则判断、文字润色、后台推演、知识检索；runtime 把 TaskType 映射到用途，再把候选模型映射回现有逻辑角色字段供安全门、telemetry 与兼容测试消费。玩家任务仍执行角色禁止规则。
4. **候选链携带完整 binding。** 每个候选包含 serviceId、modelId、base URL、解密 Key、传输类型、模型名与价格；router 按候选迭代并以 service/model 为 circuit key。认证或服务级限流跳过同服务，其余兼容错误只跳当前模型。
5. **更新先验证后事务切换。** 创建/更换连接、Key、地址或模型时，先以候选值对所有变化模型发最小请求；向量模型校验返回维度。全部成功才在事务中保存并提升版本，失败不触碰旧记录。测试接口有管理员鉴权、同源保护和限频。
6. **用量是独立、幂等、非阻塞的事实流水。** router/embedding 在最终 attempt 结果处发送脱敏记录到有界进程队列，批量写 `ai_usage_events`，唯一幂等键去重。供应商无 usage 时用字符数/4 估算并标识；价格为空则 cost 为空。定时任务先 upsert 每日汇总再删除 90 天前明细。
7. **后台保留能力、压缩信息架构。** 新壳层只暴露四个入口；原细分接口按入口懒加载。AI 管理以总量、趋势、用途排行、服务行和编辑 drawer 为主。底层代码、状态码和 metric source 只进入审计/服务端日志，不进入默认 UI。
8. **硬切真实配置，mock 独立保留。** `AI_PROVIDER=mock` 继续由测试配置路径生成 mock snapshot；生产真实配置不再读取旧 gateway/model/Kimi/Ark key 环境变量。SSE 在 snapshot 未就绪或无故事候选时保持原 `keys_missing` 降级。

## Risks / Trade-offs

- [硬切时未录入服务造成 AI 不可用] → 发布顺序先迁移和主密钥，再录入测试；缺配置时明确 `keys_missing`，不伪造成功。
- [多实例短暂配置不一致] → Redis invalidation + 5 秒版本轮询；单次请求固定快照，避免半回合切换。
- [应用进程可解密密钥] → 仅 runtime adapter 解密，最小作用域、永不序列化、日志脱敏、审计无地址/Key。
- [异步用量队列进程退出时丢少量记录] → 小批次/短 flush、幂等写入，并保留现有 analytics 与 Langfuse 作为交叉观测。
- [供应商不返回 Token] → 明确标为估算，不将估算金额包装成账单。
- [SSRF/重定向风险] → URL 解析、DNS 全地址校验、每跳禁重定向/重新验证、生产 HTTPS 与超时/大小限制。

## Migration Plan

1. 部署 schema migration、运行时表兼容和 `AI_CONFIG_ENCRYPTION_KEY`，真实 snapshot 初始为空。
2. 部署后台与 API，通过后台录入服务、模型、价格和用途并完成真实测试。
3. 启用数据库 runtime resolver，验证主/备、向量和 `keys_missing` 契约。
4. 删除旧 AI 配置读取、NewAPI 文档/脚本与外部 meter，更新部署说明。
5. 运行 contract、benchmark、admin E2E 和 live smoke；若需回滚代码，保留新表但旧版本不会读取。硬切发布不回退到旧 secret。

## Open Questions

无。产品与安全选择已在计划阶段锁定。

