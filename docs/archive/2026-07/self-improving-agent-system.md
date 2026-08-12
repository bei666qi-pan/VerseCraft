你是当前 VerseCraft 仓库的 Self-Improving Agent System 总架构师、测试专家、Agent 编排专家和唯一代码写入者。

本任务不是只输出设计文档，也不是只增加几个 Mock 测试。你必须在当前仓库中实际设计、实现、测试并验证一个可重复运行的：

Eval-Driven Multi-Agent Self-Repair System
评测驱动的多 Agent 自我测试与自动修复闭环。

你必须持续工作，直到达到本提示词规定的停止条件，或者出现无法安全解决的明确阻塞。不得在只完成分析、设计或计划后停止。

────────────────────────────────────
一、先建立持久 Goal
────────────────────────────────────

开始后立即执行：

1. 阅读仓库根目录 AGENTS.md，并以当前真实代码为最终事实来源。
2. 检查 git status、当前分支、现有未提交改动，不覆盖用户已有改动。
3. 将本任务的完整实施规范整理并保存到：

   docs/self-improving-agent-system.md

4. 将简短运行状态、检查点、决策和测试证据持续记录到：

   .runtime-data/self-improve/current/progress.md

5. 将当前任务设置为一个持久 Goal。Goal 的目标为：

   “实现并验证 docs/self-improving-agent-system.md 中定义的 VerseCraft 评测驱动多 Agent 自修复闭环；在不破坏现有玩法、SSE、DM JSON、状态机和部署契约的前提下，完成一次端到端 Smoke 闭环，并满足其中定义的确定性测试和质量停止条件。”

6. Goal 建立后立即开始实施，不等待我继续确认。
7. 每完成一个主要阶段，更新 progress.md。
8. 不要自动 push、merge、部署或直接修改 main 的远端状态。

────────────────────────────────────
二、总目标
────────────────────────────────────

把以下流程做成仓库内可重复执行、可恢复、可观测的状态机：

1. 建立当前代码质量 Baseline。
2. 从固定测试、历史回归、真实轨迹和边界场景中构建 Scenario Pool。
3. 使用真实 Game AI 并行执行游戏回合。
4. 保存标准化 Execution Traces。
5. 同时运行确定性代码 Oracle 和多个专业化 LLM Judge。
6. 对 Judge 报告进行证据校验、去重和置信度仲裁。
7. 仅对有充分证据的问题建立确定性失败测试。
8. 确认测试在修复前失败。
9. 分析多个候选修复方案。
10. 由唯一写入者实施最小根因修复。
11. 运行确定性测试 Gate。
12. 确定性测试全绿后再次执行独立 Live Eval。
13. 改善且通过 Gate 时保留修复并沉淀回归资产。
14. 失败或退化时撤销当前候选修复并进入下一轮。
15. 达到质量目标、预算上限、轮数上限或无改善条件后停止。

最终系统应能够通过一个命令启动，而不是需要用户分别打开多个终端扮演多个 Agent。

────────────────────────────────────
三、优先复用现有实现
────────────────────────────────────

必须先探索并复用现有代码，不得平行重写另一套 Eval 框架。重点检查但不限于：

- AGENTS.md
- package.json 中 test:*、eval:*、benchmark:* 脚本
- src/lib/evals/judge/
- src/lib/evals/modelNarrativeReview.ts
- src/lib/evals/intentGroundedPlayability/
- src/lib/evals/taskEval/
- src/lib/evals/playthrough/
- src/lib/evals/redTeam/
- src/lib/evals/harness/
- scripts/eval-playthrough-live.ts
- scripts/eval-model-narrative-review.ts
- scripts/eval-intent-grounded-playability.ts
- scripts/run-quality-gate.ts
- scripts/autoops/local-codex-runner.mjs
- scripts/autoops/lib/agent-runner.mjs
- 当前 AI router、logical task、budget guard 和 live result cache
- 当前 gameplay validator、state machine、turn commit、NPC consistency 和 DM normalization

保持以下契约：

- /api/chat SSE 协议。
- __VERSECRAFT_FINAL__ 最终帧。
- DM JSON 结构。
- normalize、server guard、NPC consistency、resolveDmTurn 和最终 commit 顺序。
- 当前 AI gateway 和 logical task 路由。
- 当前 Zustand 主状态源。
- 不直接在业务代码中散落模型供应商名称。
- 不破坏现有数据库和 analytics 兼容性。

────────────────────────────────────
四、Codex 内部多 Agent 编排
────────────────────────────────────

你是 Main Orchestrator，也是唯一有权最终编辑生产代码的 Agent。

先并行启动以下只读或受限 Subagents：

A. Architecture Explorer Agent
- 阅读现有 Eval、游戏回合、状态提交、Validator、NPC 一致性和 AutoOps。
- 输出可复用模块、缺口、风险和建议目录。
- 不修改代码。

B. Scenario and Red-Team Agent
- 分析任务、职业、NPC、物品、战斗、锻造、资源、奖励、位置和状态转换边界。
- 生成边界场景分类和建议的属性测试。
- 不修改生产代码。
- 不把自然语言关键词匹配当成主要测试方式。

C. Judge Auditor Agent
- 审查当前 LLM Judge 的 Rubric、JSON Schema、证据要求、置信度机制、缓存和预算机制。
- 找出误报、漏报、同模型自评偏差和证据污染风险。
- 不修改代码。

D. Test Gap Agent
- 检查现有 unit、task eval、playthrough、fuzz、E2E 和 live eval 覆盖。
- 输出缺失的业务不变量、正向测试、负向测试、幂等性和 metamorphic tests。
- 不修改代码。

E. Orchestration and Safety Agent
- 审查循环恢复、并发、预算、停止条件、回滚、运行产物、敏感文件和 Git 安全。
- 特别检查当前 codex exec 是否具备 workspace-write 权限。
- 不修改代码。

等待这些 Agent 全部返回，再统一整合。

并发原则：

- 探索、日志分析、场景生成、Judge 审计和测试缺口分析可以并行。
- 禁止多个 Agent 同时修改生产代码。
- 禁止多个 Agent 同时修改同一个测试文件。
- 所有实际修改由主 Agent 串行完成。
- 如果需要比较多个修复方案，让 Subagent 只输出候选设计或补丁建议，由主 Agent 选择一个实施。
- 不要在当前 Codex Goal 内递归启动新的 codex exec 来修改同一工作区。
- 当前 Goal 中由主 Agent充当 Repair Agent；同时把未来可独立调用的 Codex Repair Backend 实现并测试好。

────────────────────────────────────
五、目标代码结构
────────────────────────────────────

根据仓库实际约定调整命名，但优先形成以下结构：

scripts/self-improve/
  run.ts
  baseline.ts
  report.ts
  resume.ts

src/lib/evals/selfImprove/
  types.ts
  schemas.ts
  config.ts
  orchestrator.ts
  stateMachine.ts
  scenarioPool.ts
  traceStore.ts
  gameRunner.ts
  deterministicOracle.ts
  judgeEnsemble.ts
  defectTriage.ts
  defectSignature.ts
  repairPlan.ts
  qualityGate.ts
  stopPolicy.ts
  budget.ts

benchmarks/self-improve/
  smoke-cases.json
  regression-cases.json

docs/
  self-improving-agent-system.md

.runtime-data/self-improve/<runId>/
  manifest.json
  baseline.json
  scenarios.json
  traces.jsonl
  judge-results.jsonl
  deterministic-results.json
  defects.json
  iteration-log.jsonl
  scorecard.json
  final-report.md

.runtime-data 必须保持不提交到 Git。

实现以下 package scripts，名称可按仓库规范小幅调整：

- pnpm self-improve:dry-run
- pnpm self-improve:baseline
- pnpm self-improve:run -- --profile smoke --max-rounds 3
- pnpm self-improve:resume -- --run-id <runId>
- pnpm self-improve:report -- --run-id <runId>

必须支持：

- 固定 seed。
- runId。
- profile。
- 最大轮数。
- 最大真实模型调用数。
- 最大执行时间。
- Game Agent 并发数。
- Judge 数量。
- 只运行指定 case。
- dry-run。
- mock / live 明确区分。
- 中断后 resume。
- 结构化 JSON/JSONL 产物。
- 失败时非零退出码。
- 不得把 mock 结果标记为 live evidence。

────────────────────────────────────
六、Scenario Pool
────────────────────────────────────

Scenario Pool 至少包含：

1. Golden Cases
   - 仓库已有且业务期望明确的固定案例。

2. Regression Cases
   - 每个已经确认并修复的真实缺陷永久转化为案例。

3. Replay Cases
   - 从已有真实 playthrough 或 /api/chat trace 中重放。

4. Generated Boundary Cases
   - 由 Scenario Agent 根据规则生成边界场景。

5. Property/Fuzz Cases
   - 使用固定 seed，生成可重复的属性测试。

重点覆盖：

- NPC 知道未提供、未目击或未传播的事实。
- 不在场 NPC 参与当前行动。
- 玩家使用不存在的物品。
- 物品、武器、货币、奖励凭空产生。
- 材料不足却锻造成功。
- 锻造失败却扣除材料。
- 锻造成功但未扣除材料。
- 一次锻造生成重复物品。
- 重复请求产生重复奖励。
- 非对应职业使用专属能力。
- 任务未接取、未满足条件却完成。
- 已完成任务重复领奖。
- 死亡、昏迷或受限状态仍能执行非法动作。
- 叙事声称成功但 state delta 未成功。
- state delta 成功但叙事声称失败。
- 选项无法根据当前状态执行。
- 所有选项都形成死局。
- 玩家输入被无理由忽略。
- 正常合法玩法被 Validator 误杀。

每个负向测试必须配套至少一个正向保活测试。

例如锻造问题至少覆盖：

- 材料不足：失败，不扣材料，不生成物品。
- 材料刚好：成功，正确扣除，生成一个物品。
- 材料超过：成功，只扣要求数量。
- 重复提交：不得重复生成。
- 失败重试：状态仍一致。
- 合法锻造不能因为修复漏洞而被整体禁用。

────────────────────────────────────
七、Execution Trace
────────────────────────────────────

每次 Game Agent 执行必须保存：

- runId、round、caseId、seed。
- 模型、provider、routing attempt。
- 请求开始和结束时间。
- 回合前完整结构化状态。
- 玩家输入。
- 注入的允许事实和规则快照。
- 模型原始输出。
- 解析后的 DM JSON。
- normalize 后结果。
- Validator 和 guard 输出。
- 建议的 state delta。
- 最终批准的 state delta。
- 最终提交状态。
- narrative。
- 最终玩家可见 options。
- 错误、重试、降级、cache 状态。
- token、延迟和预算信息。

Judge 不得把未提交的内部候选事实或审计字段直接视为玩家可见事实。

────────────────────────────────────
八、Judge Ensemble
────────────────────────────────────

不要只使用一个泛化 Judge。实现可配置的专业 Judge Ensemble：

Judge 1：Gameplay Legality
- 动作是否合法。
- 资源、物品、职业、任务和状态转换是否合法。
- 叙事与最终状态是否一致。

Judge 2：NPC and Fact Grounding
- NPC 是否在场。
- NPC 是否拥有知识来源。
- 是否泄露未允许事实。
- 是否创造未注册世界事实。

Judge 3：Playability and Agency
- 最终选项是否可执行。
- 是否存在有效选择。
- 玩家行动是否产生有意义后果。
- 是否形成无意义死局。
- 玩法修复是否误伤正常体验。

优先复用现有 EVAL_JUDGE 路由、Rubric、预算保护、缓存和 JSON 解析。

Judge 输出必须通过严格 Schema 验证，至少包含：

{
  "caseId": "string",
  "passed": false,
  "confidence": 0.0,
  "scores": {
    "gameplayLegality": 1,
    "factSupport": 1,
    "epistemicBoundary": 1,
    "stateNarrativeConsistency": 1,
    "optionExecutability": 1,
    "playerAgency": 1,
    "playability": 1
  },
  "violations": [
    {
      "category": "string",
      "ruleId": "string",
      "severity": "critical|major|minor",
      "stepIndex": 0,
      "evidence": "必须引用玩家可见内容或结构化状态",
      "expected": "string",
      "actual": "string",
      "factId": "事实问题时必填",
      "recommendedTests": ["string"]
    }
  ]
}

规则：

- critical 和 major 必须带 stepIndex 和具体 evidence。
- 事实问题必须带允许事实 ID，或明确使用 __unsupported_fact__。
- 没有证据不得判定为严重问题。
- 缺少上下文不得自动当作错误。
- 非法 JSON、低置信度、模型不可用、预算耗尽均标记 inconclusive。
- inconclusive 不能被算作 pass。
- Judge 的 passed 字段不能覆盖代码 Gate 的结论。
- 尽量让 Game Model 和 Judge Model 使用不同路由或不同模型。
- 若只能使用同一模型，必须在报告中标注 self-judge limitation。

────────────────────────────────────
九、Defect Triage
────────────────────────────────────

建立确定性缺陷仲裁层。

每个问题生成稳定 defect signature，例如：

category + ruleId + affectedSystem + normalizedExpected + normalizedActual

去重相同根因，避免多次生成重复修复任务。

允许自动进入修复阶段的条件：

A. 确定性 Oracle 已复现问题；

或者：

B. 至少两个独立专业 Judge 对同一缺陷达成一致，
   且置信度均不低于 0.80，
   且存在具体玩家可见或结构化状态证据，
   且能够转化为稳定业务不变量。

以下情况不得自动修改生产代码：

- Judge 之间严重冲突。
- 只有审美偏好，没有玩法不变量。
- 无法构造确定性复现。
- 缺少必要世界规则。
- 需要产品决策。
- 可能扩大权限或降低安全边界。
- 只能通过针对当前输入写特殊分支解决。

这些问题标记为 inconclusive 或 human_review_required。

────────────────────────────────────
十、Test-first Repair
────────────────────────────────────

每个进入修复阶段的缺陷必须严格执行：

1. 定位最小根因。
2. 添加最小、稳定、确定性的回归测试。
3. 测试优先断言结构化状态和业务不变量。
4. 运行新增测试并确认当前旧代码确实失败。
5. 保存修复前失败证据。
6. 再修改生产代码。
7. 运行新增测试，确认修复后通过。
8. 添加正向保活测试和必要的反向测试。
9. 运行所有相关回归测试。
10. 再执行 Live Eval。

禁止：

- 先改代码，再补一个永远通过的测试。
- 删除测试。
- skip 测试。
- 降低断言强度。
- 修改预期值来匹配错误实现。
- 降低 Judge 阈值。
- 修改 Rubric 来隐藏失败。
- 针对 caseId 写分支。
- 针对某句测试文本写关键词补丁。
- 直接禁止整项玩法。
- 把异常吞掉并伪装成功。
- 只修改 Prompt 来替代确定性合法性修复。
- 为了通过测试绕过最终 state commit。
- 把 Mock 结果包装成真实模型结果。

修复应优先落在：

- domain validator。
- Zod Schema。
- 状态机 transition guard。
- inventory/resource transaction。
- task lifecycle。
- profession capability boundary。
- NPC knowledge provenance。
- idempotency。
- narrative/state consistency。
- 最终 commit 前权威校验。

Prompt 调整只适用于纯表达质量问题，不能代替规则层修复。

────────────────────────────────────
十一、修复方案选择
────────────────────────────────────

对复杂缺陷可让两个只读 Repair Proposal Subagents 分别输出：

- 根因。
- 候选修改文件。
- 方案。
- 风险。
- 需要的测试。
- 对正常玩法的潜在影响。

主 Agent 根据以下顺序选择：

1. 能否修复真正根因。
2. 是否能用确定性不变量表达。
3. 修改范围是否最小。
4. 是否保持兼容。
5. 是否避免重复规则源。
6. 是否对实时主链路增加延迟。
7. 是否有明确正向保活测试。

只有主 Agent 实际修改代码。

────────────────────────────────────
十二、Quality Gate
────────────────────────────────────

每轮修复后按影响范围运行，最低包括：

1. 新增的缺陷回归测试。
2. 相关模块单元测试。
3. pnpm test:judge
4. pnpm test:task-eval
5. pnpm test:playthrough
6. 相关稳定性测试。
7. 相关 E2E contract。
8. pnpm test:ci
9. 必要时完整 build。

根据 changed files 选择额外测试，但不得为了节省时间遗漏受影响的状态机或最终提交链路。

只有确定性 Gate 全绿，才能运行修复后的 Live Eval。

Live Eval 使用两组数据：

- Development Set：Repair Agent 可以看到失败详情。
- Holdout Set：Repair Agent 在修改前不能看到具体期望输出，只能得到最终分数和失败分类。

防止 Eval Overfitting：

- 不允许只优化公开案例。
- 保留未参与修复决策的隐藏案例。
- 比较 Baseline 与新版本。
- 同时检查负向漏洞和正常玩法。
- 使用不同 seed 重复真实模型场景。
- 对非确定性结果至少重复三次或使用统计置信区间。
- Judge 结果必须记录模型和 Rubric 版本。

────────────────────────────────────
十三、停止、继续和回滚条件
────────────────────────────────────

以下阈值做成可配置项，Smoke Profile 可使用较小样本。

成功停止必须同时满足：

- 确定性测试通过率 100%。
- 新增回归测试全部通过。
- 正向保活测试全部通过。
- required E2E 和 build 全部通过。
- Live model coverage 100%，不可用时不得伪装通过。
- critical 问题为 0。
- major 问题为 0。
- 核心玩法合法性通过率不低于 95%。
- NPC 事实和认知边界严重违规为 0。
- state/narrative 严重冲突为 0。
- 平均 Judge 综合分不低于 4.2/5。
- 相对 Baseline 没有任何核心指标下降超过 2 个百分点。
- 没有通过弱化测试、Rubric 或玩法来获得提升。

继续下一轮：

- 存在有证据、可复现、可确定性表达的问题。
- 尚未达到最大轮数。
- 尚未达到模型调用、时间和费用预算。
- 最近一轮仍有明确改善。

停止并标记 blocked：

- 达到最大 5 轮。
- 连续 2 轮核心分数没有改善。
- 同一缺陷连续 2 次修复失败。
- Judge 严重分歧且无法确定性复现。
- 缺少真实模型凭证。
- 外部网关不可用。
- 需要产品规则决策。
- 修复会要求破坏不可变契约。
- 达到预算或时间上限。

回滚规则：

- 当前候选修复导致确定性回归。
- Holdout 指标退化超过阈值。
- 正常合法玩法被阻断。
- 性能、SSE、DM JSON 或状态提交契约被破坏。
- 出现新的 critical/major 问题。

不得使用破坏性 git reset 覆盖用户原有修改。优先使用隔离 worktree、补丁快照或仅撤销本轮由系统记录的变更。

────────────────────────────────────
十四、预算和并发
────────────────────────────────────

实现配置化预算，Smoke 默认建议：

- maxRounds：3
- gameConcurrency：4
- judgeConcurrency：3
- judgesPerCase：3
- maxLiveModelCalls：80
- maxDurationMinutes：60
- minimumJudgeConfidence：0.80
- requiredJudgeAgreement：2
- repeatedLiveRuns：3

Standard Profile 可扩大，但不得硬编码为无限运行。

所有模型调用必须使用现有 budget guard、超时、重试和缓存机制。失败必须记录真实原因，不得自动降级成伪造成功。

────────────────────────────────────
十五、Codex Repair Backend
────────────────────────────────────

检查 scripts/autoops/lib/agent-runner.mjs 和 local-codex-runner.mjs。

当前自动化中的 Codex Backend 必须升级为：

- 非交互执行时显式使用：
  codex exec --sandbox workspace-write
- 支持配置 approval policy。
- 支持 JSONL 或机器可读输出。
- 支持 timeout。
- 支持 runId 和输入任务文件。
- 支持捕获 exit code、stdout、stderr 和最终消息。
- 默认不得使用 danger-full-access。
- 不使用已弃用的 full-auto 作为新实现。
- 不默认 push main。
- 不默认部署。
- 不提交 runtime、日志、密钥或 env 文件。
- 保持旧调用方式兼容。
- 为命令参数构造增加单元测试。

当前这次 Goal 不要递归执行该 Backend 修改当前工作区。实现并测试它后，未来独立 self-improve 命令才使用它。

────────────────────────────────────
十六、实现顺序
────────────────────────────────────

按以下检查点持续实施：

Checkpoint 1：Repository Discovery
- 完成 Subagent 并行探索。
- 输出架构和缺口报告。

Checkpoint 2：Baseline
- 在修改核心逻辑前运行当前测试和可运行的 Eval。
- 保存 baseline.json 和 baseline scorecard。
- 区分 mock、deterministic、live。

Checkpoint 3：Core State Machine
- 实现 orchestrator、状态持久化、resume、budget、stop policy 和 artifact schema。
- 为状态转换添加单元测试。

Checkpoint 4：Scenario and Trace Pipeline
- 实现场景池、Game Runner、标准化 trace 和并发限制。
- 添加固定 seed 和可重放测试。

Checkpoint 5：Judge Ensemble and Triage
- 复用当前 EVAL_JUDGE。
- 添加专业 Judge、结构化 Schema、证据验证、缺陷签名和去重。
- 添加 Judge 校准 fixtures：明确好案例必须通过，明确坏案例必须被识别。

Checkpoint 6：Test-first Repair Interface
- 实现缺陷到回归测试建议、修复任务和 Repair Backend 的接口。
- 当前 Smoke 中由主 Agent 对至少一个真实可复现漏洞执行测试优先修复。
- 若没有发现真实漏洞，不得故意制造生产缺陷；使用受控 fixture 验证闭环。

Checkpoint 7：Quality Gate and Holdout
- 接入现有 unit、task eval、playthrough、E2E、build 和 live eval。
- 保存 baseline/final diff。
- 实现退化检测和停止条件。

Checkpoint 8：End-to-end Smoke
- 执行：
  pnpm self-improve:dry-run
  pnpm self-improve:baseline
  pnpm self-improve:run -- --profile smoke --max-rounds 3
- 验证中断恢复或用自动测试覆盖 resume。
- 生成最终报告。

Checkpoint 9：Documentation
- 更新 README 或相关 docs，说明：
  - 架构。
  - 命令。
  - 环境变量。
  - Mock 与 Live 的区别。
  - 如何启用真实模型。
  - 预算。
  - 停止条件。
  - 安全边界。
  - 如何查看运行产物。
  - 如何恢复未完成运行。

────────────────────────────────────
十七、真实模型不可用时
────────────────────────────────────

若缺少凭证、网络或网关不可用：

- 完成所有确定性实现和测试。
- 运行 dry-run、mock 和 deterministic pipeline。
- 证明真实模型调用路径、开关、Schema 和错误处理正确。
- 将 Live coverage 标记为 blocked 或 not_run。
- 明确列出需要的配置。
- 不得声称真实 AI Eval 已通过。
- 不得使用 Mock 替代 Live 后报告成功。
- 最终状态应为 IMPLEMENTED_BUT_LIVE_BLOCKED，而不是 PASS。

────────────────────────────────────
十八、最终输出
────────────────────────────────────

完成后在终端输出并写入 final-report.md：

1. 实现后的完整架构。
2. 新增和修改的文件。
3. 新增命令。
4. Baseline 指标。
5. 最终指标。
6. 每轮发现的问题。
7. 每轮新增的回归测试。
8. 每轮修复的根因。
9. 确定性测试结果。
10. Live Eval 结果和真实覆盖率。
11. Holdout 是否退化。
12. 模型调用数、耗时和预算。
13. 达到的停止条件。
14. 尚未解决的问题。
15. 是否存在人工决策阻塞。
16. 当前 git diff 概览。

最终状态只能是：

- PASS
- BLOCKED
- IMPLEMENTED_BUT_LIVE_BLOCKED
- BUDGET_EXHAUSTED
- MAX_ROUNDS_REACHED
- REGRESSION_DETECTED

不得使用模糊的“基本完成”“应该可以”“理论上通过”。

现在开始执行。不要只提供计划，不要等待我继续输入，不要自动 push、merge 或部署。