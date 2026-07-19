## Context

Playthrough 的 `GameStateSnapshot` 是评测快照，不是 Zustand store；它只能反映 `/api/chat` 的最终 DM JSON 被 `applyDmJsonToState` 应用后的字段。职业认证则是 `useGameStore.certifyProfession` 的显式用户动作，先通过 `computeProfessionState` 计算资格再写入职业、图鉴和关系。因此在 snapshot reducer 中直接调用 profession engine 并写 `profession` 跳过了真实边界。

World Director 已有正确的异步架构：在线回合 enqueue `WORLD_ENGINE_TICK`，worker claim，reasoner 输出候选，validator 过滤，DB 事务持久化 run/snapshot/agenda，再将 soft agenda 提供给后续回合。它的端到端运行离不开 PostgreSQL 和 worker；本机 DB unavailable 时只能验证纯函数，不能声称已运行。

## Goals / Non-Goals

**Goals:**

- 将 live campaign 的成功条件限定为真实 SUT 结构化 state 的结果，禁止 post-turn reducer 授予任务、职业、道具、武器或剧情状态。
- 分开验证“DM 使职业试炼/资格成立”和“玩家通过真实 store action 认证职业”，并确保不满足资格时该 action 失败。
- 增加 director live probe，将 queue、worker、model、validator、持久化和后续消费做成一条可失败、可报告的 evidence chain。
- 对缺少 DB/worker/密钥的情形给出 non-pass 结果及原因。

**Non-Goals:**

- 不让 DM 文本直接认证职业，不改变现有认证 UX。
- 不修改 `/api/chat` 传输、SSE、schema 或 analytics event 合约。
- 不把后台 reasoner 放入在线首字前路径，也不以有限 live run 宣称全部剧情的形式化证明。

## Decisions

### 1. 取消 snapshot 后处理的状态授予

`postTurnStateReducer` 仍可用于无状态的 report 标注，但 mechanics campaign 不再传入它。职业场景先要求真实 DM `task_updates` 使试炼任务完成；若生产数据不足以从 snapshot 表示资格，campaign 报告它为 evidence gap，而不是自行调用 engine 填补。

替代方案是保留 reducer 但加“测试专用”标签；拒绝，因为输出仍易被误读为真实 gameplay pass。

### 2. 用 store integration 覆盖认证交互边界

用真实 `useGameStore` 的测试实例构造满足 / 不满足条件的任务、角色、武器和图鉴状态，调用 store action。通过只在资格满足且 action 返回 true、职业状态及副作用一致时成立；失败样例必须保持无职业。这验证产品拥有的显式认证边界，而不是在 harness 中复制规则。

### 2.1 mechanics objective 必须验证实际状态转移

weapon lifecycle 的 live check 同时要求预期装备存在且最终稳定度低于已知初始值 72。只检查装备 ID 会把无战斗、无耐久变化的轨迹误记为通过；该类 run 必须让 CLI 非零退出并保留 trace 作为失败证据。

### 2.2 交付任务必须以登记物品为前提

`t_delivery_letter_b1` 的完成 guard 读取结构化 `inventoryItemIds`，只接受登记的 `I-B08` 挂号信。没有该物品时，guard 删除候选 completion，写入不消耗时间的明确失败叙事和 commit flag；有该物品时才同时提交任务状态与 `consumed_items: ["I-B08"]`，并以最小的已登记物品/交付对象/完成结果叙事替换候选文本。这样任务结算不会把模型虚构的信件来源、历史或秘密写入世界事实。campaign 以真实 client packet 携带该物品，避免用动作文字或 prompt 假设物品存在。

### 2.3 真实 campaign 必须按 run 逐一断言

campaign 支持显式 `LIVE_MECHANICS_RUNS_PER_PERSONA`（默认 1，live soak 可提高至 5）。所有机械 check 从每条 transcript 的 `scenarioId` 和 final state 得出，并要求同一场景的每个 run 都满足；不得按场景名覆写为最后一条 run 的结果。这样重复运行中的单例软锁不能被后续通过掩盖。

### 3. director evidence 必须完整且持久化

新增/扩展一个显式 live probe。它先检查配置、PostgreSQL 和 worker 可达性，再 enqueue 一个带真 trigger 的 payload，记录该 payload 对应的 queue job id，并轮询该 job（而非任意 worker 日志）直到完成、死亡或到达 deadline。`worker:kg:once` 只处理一个 claim batch，因此队列有积压时 probe 必须连续驱动 worker，直到自己的 job 获得终态。随后 probe 读取对应的 `world_engine_runs`、agenda snapshot / items 和 director state，最后构造后续 runtime packet 证明可消费。任一环节缺失均为 inconclusive/failed，不调用内存替身。

替代方案是直接调用 `runWorldEngineTick`；拒绝，因为它绕过 queue/worker，也无法证明后台异步调度。

### 4. 遥测与性能不改变主链

所有 probe 都运行在 CLI/CI live job；线上只是已有 enqueue。不新增首字前调用、同步 DB 写或 reasoner 重试。目录中的 `.runtime-data` 报告可留作本次证据但不作为版本化 golden。

### 5. standalone worker 的本地环境必须自足

`next dev` 会读取 `.env.local`，但 `tsx scripts/vc-worker.ts` 不会。worker 在读取任何 `process.env` 配置前加载该文件；部署环境没有该文件时保持使用注入的进程环境变量，现有生产配置不变。以脚本静态契约测试锁定加载顺序，且通过实际 `pnpm worker:kg` 启动与 health heartbeat 验证，避免 director probe 的子进程配置掩盖常驻运行故障。

## Risks / Trade-offs

- [真实 DM 不一定按预期完成试炼] → 报告失败，而不修改 result；将缺失转换为明确的产品/fixture 缺口。
- [本机 PostgreSQL 或 worker 不可用] → 脚本返回 non-pass 且输出前置条件；保留纯函数测试作为实现回归，但不冒充 live evidence。
- [后台 reasoner 具有随机性与成本] → 限制单个 trigger、记录 task/model/latency/validator codes，并把无 JSON/拒绝输出保留为失败证据。
- [store 测试依赖重] → 只覆盖职业资格的最小真实状态，避免 browser 复制和整局 mock。

## Migration Plan

1. 先删除 mechanics reducer 和其误导性职业 success 断言，补上 failing/accurate report 字段。
2. 加 store integration 和 director probe 的 unit/contract 测试。
3. 在有 PostgreSQL、worker、网关的环境跑 live campaign 和 director probe；夜间 CI 归档报告。
4. 如 probe 暴露基础设施不可用，回滚仅是停止 live gate；不影响在线游戏，因为生产工作流没有改变。

## Open Questions

- 本地/CI 将使用哪个可访问 PostgreSQL 实例来运行 worker evidence；在未提供实例前，该层只能明确报告为 blocked。
