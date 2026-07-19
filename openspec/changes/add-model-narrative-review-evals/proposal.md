## Why

VerseCraft 的现有叙事评测对 SSE 契约与确定性守卫覆盖较多，但复杂叙事质量在离线模式会乐观通过，且 mock 质量脚本会把期望关键词提示给 mock provider。这使通过率可能反映测试夹具的配合程度，而不是玩家在真实模型回合中实际会遇到的幻觉、认知越界或不可玩的选项。

需要建立一个复用现有文本 DM gateway 的、可审计的模型评审层，同时明确区分确定性回归证据与真实模型质量证据，避免将 mock 成绩包装成高置信质量结论。

## What Changes

- 增加可选的真实模型叙事评审评测：对真实 `/api/chat` SSE 回合及多回合轨迹，以结构化 rubric 审查事实支撑、认知边界、状态/叙事一致性、选项可执行性、玩家能动性与悬疑可读性。
- 为评审输入和输出建立可复现的 schema、内容哈希缓存、调用预算、失败/不可判定状态与可追溯报告；模型不可用或评审结果不可信时不得伪装为通过。
- 为模型评审 prompt、结果解析、阈值/置信度处理和轨迹装配补充确定性单元测试与对抗 fixture；真实 gateway 调用仅作为显式 live 评测，不进入普通 PR 的硬门。
- 纠正评测文档与报告语义：mock/离线结果仅证明契约和守卫回归，真实叙事质量必须有 live model evidence；报告必须展示覆盖度、不可判定数和失败原因。
- 使用独立的 `VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS` 灰度开关和显式 CLI live 参数控制新能力，默认不改变 `/api/chat` 在线生成路径。
- 让 `EVAL_JUDGE` 复用 gateway 的严格 JSON 兼容路径：请求时关闭可关闭的思考输出，并仅做保守的 `<think>` / prose wrapper JSON 提取；无法得到合格 verdict 时仍如实标记为 `inconclusive`。
- 将 playthrough 的权威 `initialState` 纳入落盘 trace，避免模型评审把第一步后的快照误作回合起点，从而把无变化错误解读为真实机制进展。
- 将实际执行的客户端等价 `options_regen_only` 请求及其通过客户端解析/语义门后的结果纳入 live trace；评审只可把这类真实响应当作玩家可见选项，不能把主回合空 options 解释为已恢复。

## Capabilities

### New Capabilities

- `model-narrative-review-evals`: 以真实模型裁判审查玩家可见叙事与可玩性，并产出可追溯、不会将 mock 覆盖误报为 live 质量的评测证据。

### Modified Capabilities

- None.

## Impact

- 影响 `src/lib/evals/`、`scripts/eval-playthrough-live.ts`、相关测试、评测文档和可选的 CI nightly/dispatch 配置。
- 不修改 `/api/chat` SSE/DM JSON 契约、主游戏状态、数据库 schema 或 analytics 事件；评审只读取已完成的 SSE/轨迹，并在评测进程中调用既有 AI gateway。
- 不增加在线首包、TTFT 或普通回合最终帧等待；live 评测因 API 不可用、预算耗尽、响应无法解析或评审置信度不足时应产生 `inconclusive` 或明确失败证据，而不是自动通过。
