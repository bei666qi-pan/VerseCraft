## Why

现有 mock / 单元测试能稳定验证解析器、守卫和状态提交，却不能证明任意中文自然语言在真实模型参与后仍被正确理解；反过来，单独用模型当裁判又会形成“模型给自己判分”的假高置信。互动叙事的可玩性需要把真实意图识别、可审计场景事实和确定性状态不变量组合起来，并把无法取得真实证据的结果明确标为未定，而不是算作通过。

## What Changes

- 新增一套意图锚定的可玩性评测：用带场景事实、可执行动作、禁止结果与语义等价组的固定语料，评估真实 `PLAYER_CONTROL_PREFLIGHT` 对自然语言意图的理解。
- 将模型给出的候选控制面输入确定性 policy / state-delta oracle，验证拒绝、澄清、物品归属、位置、任务和安全边界不会因模型误解而被“mock 配合通过”。
- 提供 live CLI、结构化报告和严格门禁：真实模型覆盖、等价表达一致性、注入拒绝、关键不变量及可追溯证据均未满足时，结果必须是失败或 inconclusive，不能输出可玩性通过。
- 为小规模真实 `/api/chat` 回合抽样加入可关联的意图与叙事审查证据，保留性能、SSE 和既有模型叙事评测链路。
- 修复已复现的 DeepSeek control-plane JSON 收口不稳定：保留可关闭的 response-format 开关，但默认要求结构化 JSON，避免有效网关响应因 prose / 非 JSON content 被误归类为 `CHAIN_EXHAUSTED`。
- 为模型已识别的歧义指代与元指令增加纯函数边界收口：歧义候选降权并清除不可靠 slot；伪造系统/库存/任务状态的元指令强制阻断且清槽。该规则只裁决控制候选，不替代主叙事、epistemic 或事实提交 guard。

## Capabilities

### New Capabilities

- `intent-grounded-playability-evals`: 以真实意图解析候选和确定性场景 oracle 共同评估中文行动、边界拒绝与端到端回合可玩性的评测能力。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：离线评测脚本、评测 fixture / oracle、`PLAYER_CONTROL_PREFLIGHT` 调用入口、控制候选边界收口及其测试；不改变生产回合的 SSE / DM JSON 契约、数据库 schema、analytics 事件或客户端状态契约。
- 真实评测复用已有 one-api 与 `PLAYER_CONTROL_PREFLIGHT` / `EVAL_JUDGE` task policy，并由灰度开关和显式 `--mode live` 控制；CI 只在夜间具备密钥时运行，常规单测不调用网络。
- 不把新的模型调用加入 `/api/chat` 首字前路径；control 请求仍在既有预算内。response-format 默认收紧可能影响该短 JSON 请求的上游行为，因此必须跑首包预算与真实 control 探测；网关不可用、输出不可解析、预算耗尽或证据不足均报告 `inconclusive` 并阻断严格门禁。
- 非目标：不把 mock 变成自然语言理解器、不引入在线多 agent 协商、不以有限样本宣称数学上证明所有剧情均可玩，也不重构既有 turn engine。
