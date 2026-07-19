## 1. 真实任务与职业证据

- [x] 1.1 移除 live mechanics campaign 的职业人工 reducer，改为报告 DM 任务证据与职业资格证据，不再直接写 profession。
- [x] 1.2 为职业认证的真实 store action 补充成功与拒绝的集成测试，覆盖单职业状态不变量。
- [x] 1.3 运行无 mock 的任务/职业 live campaign；真实 DM 未产生证据时保持失败或 inconclusive。
- [x] 1.4 收紧 weapon lifecycle objective 为真实耐久状态转移，并重跑无 mock campaign；对 legacy 交付任务核对登记行囊物品，覆盖缺件阻断与持件完成；多次 run 必须逐一断言，不可按场景末条覆盖。

## 2. 后台导演真实链路

- [x] 2.1 实现或补强 live director probe 的前置检查、queue/worker/persistence/consumer evidence 报告，禁止内存替身通过。
- [x] 2.2 为 probe 的前置条件与 non-pass 分支补充 unit/contract 测试。
- [x] 2.3 在可用 PostgreSQL、worker 和网关环境执行一次真实 director probe；否则记录明确的 blocked 证据。
- [x] 2.4 Make the live probe track its own queued job across worker claim batches, then re-run it with a non-empty queue.
- [x] 2.5 Make the documented standalone worker load `.env.local` before reading its configuration; cover the ordering contract and verify a persistent local start.

## 3. 验证与收口

- [x] 3.1 运行相关 unit、intent live gate、lint、OpenSpec strict validation 与 diff check。
- [x] 3.2 同步完成的 delta spec 并在结果中区分已证明范围与仍受环境阻塞的范围。
