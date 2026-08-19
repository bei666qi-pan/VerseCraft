## MODIFIED Requirements

### Requirement: Director live evidence MUST include queue, worker, persistence, and consumption
后台导演的 live evidence SHALL 只有在 PostgreSQL 可用、目标世界的 `WORLD_ENGINE_TICK` 被真实持久化、probe 所创建的 queue job 被 worker claim 并运行、reasoner 候选依次通过 normalization/validator/enforcer/capability gates、run/agenda/director state/hint envelope 已按世界地图作用域持久化，且同 session 后续回合实际消费该 hint 时才计为通过。成功结果 MUST 包含真实非零 `runId` 与 `worldRevision`。任何环节不可用 MUST be reported as non-pass with its reason。Probe MUST NOT 把处理积压任务的任意 worker 成功日志、伪 job ID 或未提交 candidate 当作自身 job 的成功。

#### Scenario: 暗月完整后台导演链路
- **WHEN** live probe 在可用依赖上为暗月触发有效 world-engine signal 并执行同 session 后续回合
- **THEN** report MUST include its own persisted job id/status, reasoner outcome, deterministic gate results, non-zero run/revision, scoped persisted identifiers and next-turn hint consumption proof

#### Scenario: 星逆完整后台导演链路
- **WHEN** live probe 在可用依赖上为星逆青石县触发有效 world-engine signal 并执行同 session 后续回合
- **THEN** report MUST prove the same scoped chain without reading or writing Dark Moon data

#### Scenario: PostgreSQL 或 worker 不可用
- **WHEN** live probe cannot persist its job, connect to PostgreSQL, or observe its own worker completion before its bounded deadline
- **THEN** it MUST NOT claim director effectiveness and MUST emit an explicit blocked or inconclusive result

#### Scenario: 从本地 CLI 启动后台 worker
- **WHEN** 开发者通过已文档化的 `pnpm worker:kg` 在本地运行 standalone worker，且 `.env.local` 提供数据库与网关配置
- **THEN** worker MUST 在读取 worker 配置前加载该文件，并能够与 web 开发进程使用同一组配置；部署中已注入的环境变量不得被覆盖
