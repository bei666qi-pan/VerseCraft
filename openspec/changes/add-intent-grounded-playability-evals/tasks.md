## 1. 评测契约与可审计调用

- [x] 1.1 为 control preflight 增加离线 `require_model` 执行策略和执行来源，同时保持线上默认 fast path / cache 行为不变。
- [x] 1.2 为执行策略、来源和失败 / 解析退化补充单元测试，证明 fast path 或 cache 不能伪装为 live-model 证据。

## 2. 意图锚定语料与确定性 oracle

- [x] 2.1 新增版本化中文场景语料，覆盖正常行动、同义改写、否定、歧义 / 指代、注入 / 越权和安全边界，并为每类声明授权事实与状态不变量。
- [x] 2.2 实现纯函数 corpus lint 与候选控制面 oracle，连接 normalize input 和 pre-narrative delta，产出可追溯失败证据。
- [x] 2.3 编写 oracle 单元测试，包含正确候选、错误 intent / slot、假高置信歧义、注入放行和禁止状态变化，确保 mock 不能替错误模型答案通关。

## 3. Live 矩阵、报告与端到端证据

- [x] 3.1 提供显式 live / dry-run CLI、feature flag、严格门禁、JSON / Markdown 报告和 Wilson 区间；inconclusive、非 model 来源或覆盖不足必须导致严格失败。
- [x] 3.2 将具有完整事实包的 live case 与实际 `/api/chat` trace 及模型叙事评测结果关联，缺少任一证据不得计入端到端通过。
- [x] 3.3 将真实文本 DM 场景接入夜间 CI 产物，并更新评测文档，清楚说明覆盖范围、可用证据与不能外推的风险。

## 4. 验证与真实运行

- [x] 4.1 运行 corpus / oracle 单元测试、相关 control preflight 测试、lint、OpenSpec strict validation 和 diff check。
- [x] 4.2 使用配置好的 one-api 对完整意图矩阵运行 `require_model` 真实测试，并执行至少一个实际 `/api/chat` 文本 DM 抽样；保存报告并如实处理失败或 inconclusive。

## 5. Control-plane JSON 收口修复

- [x] 5.1 将在线短 JSON 的 response-format 默认改为严格 JSON object，同时保留环境变量回滚开关。
- [x] 5.2 为默认与回滚配置补充 router / control contract 测试，并确认非 JSON 不会被计为成功。
- [x] 5.3 复跑真实非流式 control、`/api/chat` 首包预算和意图矩阵，记录改动后的 evidence。
- [x] 5.4 在 parser 后增加纯函数 control boundary guard：歧义指代不得留下高置信 slot，元状态篡改不得进入可执行候选。
- [x] 5.5 为 boundary guard、歧义、伪造库存 / 任务和正常对话回归补充测试，并用真实模型安全矩阵复测。
