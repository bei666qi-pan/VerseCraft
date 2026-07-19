## ADDED Requirements

### Requirement: Live mechanics evidence MUST not synthesize gameplay state
实时 mechanics campaign SHALL 只把 `/api/chat` 最终结构化输出经既有 state apply 后得到的状态计为 DM gameplay evidence。campaign MUST NOT 在 post-turn reducer 或等价测试钩子中授予职业、完成任务、道具、武器或剧情状态。

#### Scenario: 职业试炼未由 DM 完成
- **WHEN** live DM 回合没有把职业试炼写入完成状态
- **THEN** campaign MUST report the profession objective as failed or inconclusive and MUST NOT call certification logic to make it pass

#### Scenario: 职业试炼完成
- **WHEN** live DM 的 final JSON 通过既有 state apply 使试炼任务完成
- **THEN** report MUST preserve the task evidence separately from the explicit certification action

#### Scenario: 武器路径没有发生真实耐久变化
- **WHEN** a live weapon-lifecycle trace still has its initial stability after the requested combat actions
- **THEN** the mechanics report MUST mark the weapon objective as failed and MUST NOT count mere equipment possession as gameplay evidence

### Requirement: Profession certification MUST retain the product interaction boundary
职业认证 SHALL 只能经 `useGameStore.certifyProfession` 的既有资格计算和显式用户动作完成。集成测试 MUST 覆盖符合资格的成功认证及不符合资格的拒绝，并验证认证后职业状态。

#### Scenario: 玩家满足职业资格并认证
- **WHEN** 真实 store state 满足一个职业的试炼和资格条件且调用认证 action
- **THEN** action MUST return success and persist that profession as current profession

#### Scenario: 玩家不满足职业资格
- **WHEN** 真实 store state 缺少试炼或行为资格且调用认证 action
- **THEN** action MUST return failure and MUST NOT mutate current profession

### Requirement: Director live evidence MUST include queue, worker, persistence, and consumption
后台导演的 live evidence SHALL 只有在 PostgreSQL 可用、`WORLD_ENGINE_TICK` 被入队、probe 所创建的 queue job 被 worker claim 并运行、reasoner 候选通过既有 validator、run/agenda/director state 已持久化且后续 runtime consumer 可读取时才计为通过。任何环节不可用 MUST be reported as non-pass with its reason。Probe MUST NOT 把处理积压任务的任意 worker 成功日志当作自身 job 的成功。

#### Scenario: 完整后台导演链路
- **WHEN** live probe 在可用依赖上触发有效 world-engine signal
- **THEN** report MUST include its own job id/status, reasoner outcome, validator result, persisted run/agenda/state identifiers and a later-read consumption proof

#### Scenario: PostgreSQL 或 worker 不可用
- **WHEN** live probe cannot connect to PostgreSQL or cannot observe worker completion before its bounded deadline
- **THEN** it MUST NOT claim director effectiveness and MUST emit an explicit blocked or inconclusive result

#### Scenario: 从本地 CLI 启动后台 worker
- **WHEN** 开发者通过已文档化的 `pnpm worker:kg` 在本地运行 standalone worker，且 `.env.local` 提供数据库与网关配置
- **THEN** worker MUST 在读取 worker 配置前加载该文件，并能够与 web 开发进程使用同一组配置；部署中已注入的环境变量不得被覆盖
