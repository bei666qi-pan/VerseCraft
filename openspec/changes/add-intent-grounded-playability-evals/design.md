## Context

VerseCraft 已有 `PLAYER_CONTROL_PREFLIGHT`、确定性 fast path、输入守卫、turn-engine delta 和真实 `/api/chat` playthrough 工具。它们分别可以测试，但尚没有一条证据链能回答：真实模型对同一场景的多种自然语言表达是否作出正确且安全的控制面候选，以及该候选进入确定性规则后是否仍保持可玩边界。

短、明确输入会命中 control fast path；缓存也会掩盖网关调用。因此把“请求成功”或“模型裁判给高分”计为意图理解覆盖会产生假通过。在线回合的首包预算也不允许为评测增加调用。

## Goals / Non-Goals

**Goals:**

- 建立版本化、人工审阅的中文场景 corpus：每个 case 明确可见事实、允许 / 禁止行动、预期意图、等价表达组、澄清条件和不可违反的状态结果。
- 让真实 `PLAYER_CONTROL_PREFLIGHT` 在离线评测中可被强制调用，并报告模型调用、缓存 / fast path 来源、原始候选和解析失败；只有来源为 model 的结果才计入 live coverage。
- 用纯确定性 oracle 判断候选控制面与 case policy 的兼容性，并将候选连接到 `normalizePlayerInput` 和 pre-narrative delta，避免 mock 自行“理解”文本或替模型修正答案。
- 使用严格汇总门禁，把 `inconclusive`、来源不明、模型覆盖不足、等价组不一致、注入未阻断或关键不变量失败都视为不可声明通过；可选地关联真实 `/api/chat` trace 与模型叙事审查报告。

**Non-Goals:**

- 不改变生产控制面、`/api/chat` SSE / DM JSON、数据库 schema、analytics 事件或客户端存档。
- 不使用 LLM judge 作为自然语言 ground truth；它只可作为现有叙事质量的补充证据。
- 不用有限 corpus 声称形式化证明全部世界、全部模型版本或全部玩家输入均可玩。

## Decisions

### 1. 以“模型候选 + 确定性 oracle”替代 mock 理解自然语言

Corpus 由人工写出场景事实与预期 policy：intent、必需 / 禁止 slots、期望处理（允许、澄清、拒绝）和后果不变量。真实模型只负责把输入映射为 `PlayerControlPlane` 候选；oracle 只检查候选与这些已知规则的关系，并不从文本猜含义。

备选方案是纯 heuristic/mock 分类；拒绝，因为它只能证明规则实现符合自身词表。另一个备选是模型互评；拒绝作为通过依据，因为同源偏差会把无依据判断包装成高分。

### 2. 给离线调用显式的执行来源与 require-model 模式

在 control preflight 的参数 / 结果中增加仅供评测使用的执行策略与 source（`fast_path`、`cache`、`model`）。`require_model` 跳过 fast path 和 cache，仍复用同一 task policy、prompt、解析器、超时和网关；生产默认维持原有 prefer-fast-path 行为。若网关失败或输出不能解析，返回 inconclusive evidence，而非用 heuristic 代答。

备选是仅构造更长的输入来规避 fast path；拒绝，因为规则演进后不能保证，且无法审计。备选是改变线上默认；拒绝，因为会影响 TTFT。

### 3. 评测分三层输出，严格区分断言对象

1. Corpus lint：所有 case 均有事实、policy、不变量与等价组；它只证明样本设计完整。
2. Deterministic oracle tests：已知模型候选（包括错误候选）必须被接受或拒绝，证明 oracle 不会为坏答案放行。
3. Live matrix：每个语义表达使用 `require_model` 调真实网关，检查 per-case policy、等价组一致性、安全拒绝与来源覆盖。严格模式不允许 inconclusive 或未调用模型的表达通过。

端到端抽样再通过实际 `/api/chat` 创建 trace，并使用现有 narrative-review evaluator 审查 player-visible 结果。该层验证回合接线，不能替代第一、二层的事实 oracle。

### 4. 预注册门禁并报告范围而不是伪造总体置信

报告必须列出 corpus 版本、模型 / task、每组表达数量、live coverage、通过 / 失败 / inconclusive、失败证据和 Wilson 置信区间。严格 gate 要求 100% live coverage、100% 关键安全和 state invariant、100% 等价组一致性；小样本的区间只描述本次受测分布，不外推为全局可玩性证明。

### 5. 保持离线与可开关

新增 `VERSECRAFT_ENABLE_INTENT_GROUNDED_PLAYABILITY_EVALS`，默认关闭。CLI 仅在显式 `--mode live` 且开关已开时调用网关；常规 unit / CI PR 路径跑 corpus/oracle，不访问网络。夜间 CI 在密钥可用时运行真实矩阵和 trace 抽样并归档报告。

### 6. 在线短 JSON 默认请求 response-format，但保留回滚开关

DeepSeek gateway 已证明可用：主叙事和 control 流式探测均返回 200；但 `PLAYER_CONTROL_PREFLIGHT` 的非流式评测在默认“relax response format”下会收到无法通过严格 JSON 收口的候选，从而被正确计为 `CHAIN_EXHAUSTED`。对支持 OpenAI-compatible JSON object 的目标网关，默认改为请求 `response_format: { type: "json_object" }`，继续使用已有 `AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT=1` 作为显式兼容回滚。

备选方案是只扩展 prompt 或把解析失败降级为启发式通过；拒绝，因为前者不能约束模型输出形状，后者会重新制造假高置信。此改动不增加调用次数，不改 SSE，不引入 reasoner；必须以 control 非流式探测、`/api/chat` 首包预算和真实 matrix 验证。

### 7. 模型意图识别后，以纯函数收口歧义与元状态篡改

`PLAYER_CONTROL_PREFLIGHT` 继续负责理解自然语言；在 parser 之后新增无 IO 的 control boundary guard。若候选带有 `ambiguous_*` 风险，或输入具有无明确先行词的短指代，guard 会把候选降为 `other`、置信度上限 0.4 并清除 slot，交由主笔要求澄清。若候选或输入表明“系统消息 / 忽略规则 / 改写库存或任务 / 跳过门禁”等元状态篡改，guard 强制 `meta + block_dm`、清除 slot 并提供拒绝提示。这样模型负责识别复杂表达，确定性层负责不允许候选把未证实状态作为可提交事实。

这不是用关键词取代意图识别：该规则只覆盖高风险元操作和明确歧义，普通 dialogue、explore、investigate 仍保留模型判断，后续再由既有事实、epistemic、任务和 commit guard 裁决。

## Risks / Trade-offs

- [模型输出有随机性、成本与服务不稳定] → 每个表达记录运行次数和原始证据；严格模式把失败、超时、解析失败全部留为 inconclusive / failed，不回退成通过。
- [人工 corpus 本身偏狭或标注错误] → fixture 带版本、审阅说明和 corpus lint；覆盖探索、调查、对话、道具、战斗、歧义、否定、指代、注入和越权请求，报告未覆盖类型。
- [require-model 与线上 fast path 有差异] → 分开报告 model-understanding 与 fast-path regression；端到端抽样保留线上默认路径，二者都不冒充对方。
- [真人 trace 缺少 lore/reveal 事实] → trace case 携带场景授权事实和禁止事实，且只有具有完整 evidence bundle 的回合可进入叙事审查门禁。
- [评测错误地影响实时性能] → 仅新增离线入口，不在 route 首字前调用；生产默认不变。
- [部分兼容 gateway 不支持 json_object] → 保留 `AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT=1` 作为独立回滚，且将该配置与实际 probe 结果写入报告。

## Migration Plan

1. 合入默认关闭的 corpus、oracle、CLI 和单元测试；PR 只运行无网络验证。
2. 在具备 one-api 凭据的环境手动执行 live matrix、真实 `/api/chat` 抽样和 narrative review，保存 JSON / Markdown 报告。
3. 将夜间 CI 配置为显式开关和密钥保护的 live job；任何严格 gate 不通过都保留失败产物，不把它降级成绿灯。
4. 回滚只需移除夜间 job 或关闭环境开关；不影响在线回合或存档。
