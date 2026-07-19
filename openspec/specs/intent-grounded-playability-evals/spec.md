## Purpose

为 AI 驱动叙事回合提供以真实意图候选、场景事实和确定性状态不变量共同构成的可审计可玩性评测；TBD：随新玩法扩展语料覆盖范围。

## Requirements

### Requirement: 版本化意图锚定场景语料
系统 SHALL 提供版本化、机器可读且人工可审阅的中文场景语料。每个语义 case MUST 包含可见 / 授权事实、表达组、预期 intent 与处理 policy、必需或禁止 slot、状态不变量和可追溯的 case 标识；语料 MUST 覆盖正常行动、否定、歧义 / 指代、越权或注入以及安全边界。

#### Scenario: 语料缺少可判定证据
- **WHEN** case 缺少场景事实、期望 policy、不变量或等价表达
- **THEN** corpus lint MUST 失败，且该 case 不得进入通过统计

#### Scenario: 语义等价表达
- **WHEN** 同一 case 的多个中文表达在同一场景下运行
- **THEN** 评测 MUST 记录它们分别的候选与 verdict，并按 case 声明的 policy 检查一致性

### Requirement: 真实模型意图调用的来源可审计
离线评测 SHALL 能以 `require_model` 策略调用同一 `PLAYER_CONTROL_PREFLIGHT` task、prompt、解析器和 gateway，并在结果中报告 `model`、`fast_path` 或 `cache` 的执行来源。默认线上策略 MUST 保持现有 fast path / cache 行为。

#### Scenario: 强制真实模型评测
- **WHEN** live CLI 使用开关启用且指定 `--mode live`
- **THEN** 每个计入 live coverage 的表达 MUST 具有 `model` 来源；fast path、cache、网关错误或解析失败 MUST 不得计为模型通过

#### Scenario: 网关或输出不可用
- **WHEN** 真实模型调用超时、失败或产生不可解析控制面
- **THEN** 报告 MUST 标记 `inconclusive` 并保留原因，严格门禁 MUST 失败

### Requirement: 候选控制面必须经过确定性可玩性 oracle
系统 SHALL 将真实或 fixture 控制面候选交给纯确定性 oracle。oracle MUST 依据 case 提供的事实和 policy 评估 intent、slot、拒绝 / 澄清处理和禁止状态结果，并结合 `normalizePlayerInput` 与 pre-narrative delta 验证关键状态不变量；oracle 不得调用网络或依赖模型判断文本含义。

#### Scenario: 模型错误地执行越权行动
- **WHEN** 候选把 case 禁止的物品、地点、事实或注入指令当作可执行行动
- **THEN** oracle MUST 产生失败 verdict，并明确关联被违反的 case invariant

#### Scenario: 允许的正常行动
- **WHEN** 候选匹配 case 的授权 intent、slot 与处理 policy
- **THEN** oracle MUST 通过，并输出结构化的 state-delta 检查证据

### Requirement: 严格可玩性汇总不得把未证实当通过
系统 SHALL 产出 JSON 与人可读报告，至少包含 corpus 版本、task / 模型、case 与表达覆盖、执行来源、verdict、证据、失败聚类和受测样本的置信区间。严格门禁 MUST 要求完整真实模型覆盖、所有关键安全与状态不变量通过、所有声明等价组一致且没有 inconclusive；报告 MUST 明确受测范围和未覆盖风险。

#### Scenario: 只有 mock 或不完整模型证据
- **WHEN** 运行未启用 live 模式、任一表达未调到模型，或存在 inconclusive
- **THEN** 汇总 MUST 不得声称可玩性已证明，严格门禁 MUST 以非零退出状态失败

#### Scenario: 端到端真实回合抽样
- **WHEN** 有完整场景证据的 case 进入实际 `/api/chat` 抽样
- **THEN** 报告 MUST 将 input、SSE final、结构化状态、意图 oracle 和叙事审查结果关联；任一证据缺失 MUST 阻断该抽样被计为端到端通过
