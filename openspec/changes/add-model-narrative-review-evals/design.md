## Context

VerseCraft 已有 deterministic guard、mock playthrough、`JudgeService` 和 live playthrough 脚本，但它们没有形成可靠的真实质量证据边界：复杂 outcome 的离线判断可以乐观通过，且 `JudgeService` 在 live 调用失败或预算耗尽时会以 offline heuristic 替代。当前报告因而可能同时包含真实模型与启发式结果，却没有要求调用方把二者分开解释。

本变更只处理离线评测进程。线上 `/api/chat` 继续按现有 staged workflow 完成 SSE 与最终 DM JSON；评测在收到权威 final 后，读取玩家可见 narrative、options、结构化 DM JSON 和可审计的轨迹状态，并通过既有 `EVAL_JUDGE` AI service logical task 调用同一个 OpenAI-compatible gateway。

## Goals / Non-Goals

**Goals:**

- 让真实模型评审能发现确定性规则难以覆盖的幻觉、NPC 认知越界、叙事/状态冲突、伪选项和玩家能动性问题。
- 在类型与报告层严格区分 `live_model`、`offline_heuristic`、`inconclusive` 与 `not_run`，使 live 质量 gate 不会被 fallback 或缺失证据“通过”。
- 复用 `EVAL_JUDGE` gateway、现有 rubric/harness 的预算与内容哈希缓存，且提供独立、可重复的 live 运行记录。
- 在 CI 保持快速确定性门禁；只有配置 API 凭证且显式启用的 nightly/dispatch 才运行 live review。

**Non-Goals:**

- 不修改 `/api/chat`、SSE final envelope、prompt、DM JSON 契约、state delta、world tick、数据库 schema 或线上 analytics。
- 不尝试以 LLM 裁判替换 deterministic validators，也不把“模型的主观判定”当作玩家状态真相源。
- 不承诺单一模型评审绝对正确；高争议、低置信或未能引用证据的结论必须保留为不可判定。

## Decisions

### 1. 建立显式证据来源，而非以 fallback 填满结果

新增/收紧评审结果的 provenance：只有成功解析的 `live_model` verdict 才计入 live coverage、pass/fail 及质量 gate。预算耗尽、网络错误、JSON 无法解析、缺少证据引用、低置信或裁判分歧都会产生 `inconclusive`，并携带 machine-readable reason；`offline_heuristic` 仅作为开发辅助与 deterministic regression，不能作为 live 审核结论。

这比保留当前“live 失败时返回 heuristic verdict”的方案更诚实。代价是 live report 会出现未覆盖样本；通过率将同时展示覆盖率、不可判定数与问题清单，而不是用乐观值掩盖空白。

### 2. 评审输入必须包含可验证事实与逐步证据

构造独立的 `ModelNarrativeReviewTarget`，包含：case/scenario ID、玩家动作、权威 DM JSON、玩家可见 narrative/options、前后结构化摘要、已允许/禁止的 facts 与逐步 transcript。prompt 要求每个 critical/major finding 引用 step 和可见 excerpt，并将无法从输入证实的指控标为未判定。

不让裁判从 narrative 推断状态，也不把完整全局 lore 无筛选地塞给模型：与 NPC 或玩家相关的事实必须沿用评测 fixture 的 reveal/actor scope。这样能判断幻觉，同时避免评测器本身制造知识泄漏。

### 3. 使用结构化 rubric + 多次独立评审，按成本逐级运行

新增用于互动叙事的 rubric（事实支撑、认知边界、状态一致性、选项可执行性、玩家能动性与可读性）。每条 issue 必须有严重度与证据。默认 smoke 每 case 一名 judge；standard profile 在预算允许时运行奇数个独立评审并报告共识/分歧。对发现 critical/major 的单次结果不以多数投票抹掉，而是保留为人工复核线索；质量 gate 以有充分 live 覆盖的 case 中的严重问题为准。

复用 `EVAL_JUDGE` logical task，而不是直连厂商模型或增加新的模型字符串。保留现有 content-hash cache 和全局预算 guard，配置中加入每运行 case 数、judge 数、timeout、最低置信和最低覆盖率。

### 4. 分层门禁和报告语义

- PR：继续运行 unit、contract、guard 和 mock 测试；它们的报告标签是 `deterministic_regression` 或 `mock_simulation`，不得声称真实叙事质量已验证。
- Live：显式 `--mode live`、feature flag 和 gateway 可用才运行。结果为 `inconclusive` 时，默认非阻断但使严格的 `--assert-live-coverage` 失败；若出现有证据的 critical/major issue，严格 gate 失败。
- 报告：JSON 和 Markdown 都展示模型/任务 ID、case/content hash、timestamp、缓存命中、覆盖率、不可判定原因、原始评分、证据 excerpts 与判定；不写入 secrets 或完整敏感 prompt。

### 5. 以 unit/fixture 校准模型评审边界

确定性测试覆盖 target 装配、prompt 约束、严格 JSON parser、provenance 迁移、缓存键和汇总 gate；fixture 至少包括事实幻觉、低 reveal 泄露、叙事与 delta 冲突、不可行动选项、健康叙事、无证据指控、gateway/预算/无效 JSON 失败。真正的模型调用只在明确 live 命令中执行；保存脱敏 trace 与审查报告供回归和人工复核。

### 6. EVAL_JUDGE 使用独立的严格 JSON transport 兼容层

`EVAL_JUDGE` 是离线任务，但它的输出与 control-plane JSON 一样必须被机器严格解析。gateway 若支持关闭思考，则请求携带相同的禁用思考参数；响应仅移除 `<think>` 包装并提取第一个完整 JSON object，再进入既有严格 verdict parser。该任务不继承 online short JSON 的快速失败、重试或 fallback 政策，以保留离线评审的完整预算与 role chain。

这避免将“格式包装”误报为 gateway 不可用，同时不会接受不完整、无证据或 schema 不合法的 verdict；后者仍保持 `inconclusive`。

### 7. Trace 必须保留首回合前的权威状态

落盘 trace 与内存 transcript 一样保存 `initialState`。模型评审 CLI 已优先读取该字段；它不能以第一步后的 `stateSnapshot` 代替初始状态，否则首次修复、消耗和任务完成会失去可审计的前后对比。旧 trace 仍可读取，但其缺失初始状态只构成较弱证据，不得用于声称机制变化已被完整复审。

### 8. 选项可玩性必须记录实际 UI 等价补齐结果

主 DM 回合的 `options` 为空或不足四条时，浏览器会在回合完成后请求 `options_regen_only`，至多进行一次 repair，并只在 SSE final 可解析、经过与客户端一致的去重/语义门、且最终得到两至四条真实模型行动时写入可点击选项。四条仍是补齐目标；两至三条被明确记录为 `complete: false`，不能由客户端伪造剩余槽位。live campaign 不得在 trace 内自行编造选项来掩盖主回合空值；它应对该回合发起同一 purpose/body 形状的实际 `/api/chat` 请求，记录 transport、request ID、解析/语义拒绝信息、是否写入、是否完整及最终 options。

review target 只在该证据明确显示 `applied: true` 且结果为两至四条选项时，才将其作为玩家可见 options，同时向 judge 标注来源为 client regeneration 及完整性。请求失败、少于两条、解析失败或语义拒绝时，review 必须保留空选项与失败证据，使 option-executability / agency 的问题仍可被发现。

## Risks / Trade-offs

- [模型评审本身会误判或随模型漂移] → 用有证据的 rubric、低温度、独立评审、校准 fixtures、模型/版本记录和人工复核队列；将分歧/低置信标为不可判定。
- [live 调用带来成本和不稳定性] → 显式开关、按 profile 采样、预算 guard、hash cache、timeout 与 nightly/dispatch 隔离。
- [裁判看到不应知道的事实，导致错误判定] → target 只携带 scenario-scoped、reveal-gated facts，并为 fixture 加泄露/误伤测试。
- [新的评测脚本误影响玩家等待] → 评测是独立进程，只在 SSE final 后读取结果；不接入在线请求路径。
- [现有使用者依赖 fallback verdict] → 保留 offline API 供 mock/本地测试使用，但 live 调用者改为显式处理 `inconclusive`；文档迁移说明其证据含义变化。
- [关闭思考参数在部分 gateway 不兼容] → 仅复用项目已有兼容参数；响应端仍保持严格 parser，HTTP 或 schema 失败继续归类为 `inconclusive`。
- [评测脚本把 server 原始 options 误作客户端可见 options] → 复用 options-only final 解析、去重和语义质量门；只有完整成功写入的结果可进入 review target，并保存失败诊断。

## Migration Plan

1. 先加入 typed result、严格 parser、rubric/fixture 和单元测试，feature flag 默认关闭。
2. 将 live playthrough/新 review script 接到 `EVAL_JUDGE`，输出新报告而不改线上链路；以 smoke 运行校准。
3. 更新文档和 nightly/dispatch workflow，使现有 mock 评测标签降级为回归证据；启用 live report artifact。
4. 观察覆盖率、inconclusive 原因和误伤案例；达到约定覆盖率后才使用严格 live assert。回滚只需关闭 `VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS` 或移除显式 live 参数，既有 mock/contract 流程不变。

## Open Questions

- 真实模型 nightly 的最低覆盖率与每次最大成本将先按现有 `budgetGuard` 默认值落地，随后以一周基线数据校准。
- 对 multi-judge 的 critical/major issue 是否自动失败，或始终要求人工确认，将先以“报告且严格模式失败”为默认，并在校准集累积后再调整。
