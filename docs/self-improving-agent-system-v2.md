你是 VerseCraft Self-Improving Agent System 的主 Orchestrator、测试架构师和唯一生产代码写入者。

当前系统已经完成一次 Live Smoke，但交付报告只能证明真实 AI 网关、SSE、JSON、Judge 和基础 Quality Gate 可运行，不能证明完整自修复闭环已经成立。

当前报告存在以下未完成事项：

1. Round 1 缺陷为 0，因此 Repair Agent 从未被真实触发。
2. 一轮干净结果被提前判定为整体完成。
3. 确定性检查显示 12/14，却报告“完全成功”。
4. 尚未证明 Scenario Agent、Repair Planner、Code Writer 和 Independent Verifier 形成真实多 Agent 闭环。
5. 尚未通过已知缺陷或隔离 Mutation 验证：
   发现缺陷 → 新增失败测试 → 修改代码 → 测试转绿 → Live Eval 改善。
6. 当前更像 Smoke Pipeline，而不是可持续 Campaign。

你的 Goal 是：

将现有实现升级为真正的、证据充分的、可持续运行的 Multi-Agent Eval–Repair Campaign，并完成至少一次真实的端到端修复分支验证。

不得只修改文档，不得在完成一轮干净 Smoke 后停止，不得自动 push、merge 或部署。

────────────────────────
一、先审计当前真实实现
────────────────────────

先读取：

- AGENTS.md
- docs/self-improving-agent-system.md
- src/lib/evals/selfImprove/**
- scripts/self-improve/**
- package.json
- 最近一次 .runtime-data/self-improve 运行产物
- stopPolicy、orchestrator、scenarioPool、gameRunner、judgeEnsemble、defectTriage、repairPlan、qualityGate、Codex backend

检查并明确回答：

1. 为什么 Round 1 defects=0 后立即停止。
2. 15 个 Scenario 是否全部真实执行，还是只加载到了 Pool。
3. 每个场景运行了几次。
4. 三个 Judge 是否真实并行调用，分别使用什么 Rubric、模型和证据。
5. Repair Agent 是否曾经被调用。
6. Codex Backend 是否真正修改过代码。
7. 12/14 的两个未通过项是什么。
8. 如果它们是 expected=fail 的负向案例，为什么没有按 expectation match 统计为 14/14。
9. 当前 PASS、BLOCKED、INCONCLUSIVE 的具体判定代码。
10. 当前是否存在“无缺陷即成功”的提前退出路径。

将审计结果写入：

.runtime-data/self-improve/current/closure-audit.md

完成审计后立即修改实现，不等待确认。

────────────────────────
二、重构停止策略
────────────────────────

新增并严格执行以下概念：

- minRounds
- maxRounds
- minExecutedCases
- minimumCategoryCoverage
- repeatedLiveRuns
- liveCoverage
- deterministicExpectationMatchRate
- judgeCalibrationPassed
- holdoutExecuted
- keepAlivePassed
- maxDurationMinutes
- maxLiveModelCalls
- noImprovementRounds

默认 Campaign 配置：

minRounds = 3
maxRounds = 8
repeatedLiveRuns = 3
minExecutedCases = Scenario Pool 中所有 required cases
maxDurationMinutes = 240
maxLiveModelCalls = 200
gameConcurrency = 4
judgeConcurrency = 3
minimumJudgeConfidence = 0.80
requiredJudgeAgreement = 2
noImprovementRounds = 2

禁止：

if defects.length === 0 → PASS

改为：

若 defects.length === 0，但尚未满足 minRounds、覆盖率、重复采样、Holdout 或 Judge calibration：

状态进入 EXPAND_SCENARIOS 或 NEXT_ROUND，不得进入 PASS。

只有以下全部满足才能 PASS：

- completedRounds >= minRounds
- required Scenario 全部执行
- liveCoverage = 100%
- deterministicExpectationMatchRate = 100%
- Judge calibration 通过
- Holdout 已执行
- 正向 Keep-alive 全部通过
- critical defects = 0
- major defects = 0
- Live 通过率 >= 95%
- 无核心指标显著退化
- 所有 required 测试通过

将“没有发现缺陷”和“证据证明可以停止”拆成两个不同状态：

- CLEAN_BUT_INSUFFICIENT_EVIDENCE
- PASS

────────────────────────
三、修正确定性指标
────────────────────────

不得再使用容易误解的 12/14。

对每个检查输出：

- expectedOutcome
- actualOutcome
- expectationMatched

汇总必须分为：

- expectationMatches：例如 14/14
- positiveCasesPassed：例如 12/12
- expectedRejectionsObserved：例如 2/2
- unexpectedFailures
- unexpectedPasses

只要 expectationMatches 不是 100%，Quality Gate 必须失败。

增加针对这个统计逻辑的单元测试。

────────────────────────
四、建立真实 Codex 多 Agent 配置
────────────────────────

创建或完善：

.codex/config.toml
.codex/agents/scenario-auditor.toml
.codex/agents/gameplay-rule-auditor.toml
.codex/agents/judge-auditor.toml
.codex/agents/test-gap-auditor.toml
.codex/agents/repair-planner.toml
.codex/agents/independent-verifier.toml

配置：

[agents]
enabled = true
max_concurrent_threads_per_session = 6

各 Agent 职责：

Scenario Auditor：
- 只读。
- 生成 NPC、任务、职业、物品、锻造、战斗和状态边界场景。
- 不修改代码。

Gameplay Rule Auditor：
- 只读。
- 找到 Validator、状态机和最终 commit 的规则漏洞。
- 返回文件、函数和业务不变量。

Judge Auditor：
- 只读。
- 检查误报、漏报、证据不足、同模型自评和 Rubric 漏洞。

Test Gap Auditor：
- 只读。
- 设计失败测试、正向保活测试、属性测试和 metamorphic tests。

Repair Planner：
- 只读。
- 输出候选根因修复方案，不直接修改生产代码。

Independent Verifier：
- 只读。
- 在主 Agent 修改后独立检查 diff、测试和潜在 Reward Hacking。

主 Agent是唯一生产代码写入者。

开始每一轮重大分析时必须明确 spawn 独立 Subagents，等待全部返回并汇总，不得只在文档中声称使用了 Subagents。

运行报告中必须记录：

- subagentName
- threadId
- task
- startedAt
- completedAt
- resultSummary
- whetherCodeWasModified

────────────────────────
五、增加 Campaign 模式
────────────────────────

实现命令：

pnpm self-improve:campaign -- [options]

至少支持：

--live
--profile
--min-rounds
--max-rounds
--repeat
--max-duration-minutes
--max-live-calls
--game-concurrency
--judge-concurrency
--repair-backend
--resume
--run-id
--case
--seed
--calibration
--no-repair

Campaign 状态机：

BASELINE
→ BUILD_SCENARIO_POOL
→ RUN_GAME_AGENTS
→ RUN_DETERMINISTIC_ORACLES
→ RUN_JUDGE_ENSEMBLE
→ TRIAGE
→ 若无缺陷且证据不足：EXPAND_SCENARIOS
→ 若确认缺陷：REPRODUCE_WITH_TEST
→ REPAIR_PLAN
→ CODE_REPAIR
→ DETERMINISTIC_GATE
→ LIVE_REEVAL
→ HOLDOUT_EVAL
→ NEXT_ROUND 或 PASS/BLOCKED

每一步写入可恢复状态。

进程中断后能够使用同一 runId 恢复。

────────────────────────
六、让 Scenario Agent 主动探索
────────────────────────

每轮无缺陷时，不得原样重复相同 15 个输入。

必须执行至少一种：

- 同义表达变换
- 初始状态组合变换
- 边界数量变换
- 行动顺序变换
- 重复请求
- 并发或幂等性场景
- NPC 在场/不在场变换
- NPC 已知/未知事实变换
- 材料不足/刚好/过量变换
- 任务未接取/进行中/完成/已领奖变换
- 职业有权限/无权限变换

场景必须具有稳定 seed、来源、规则依据、预期不变量和 novelty signature。

相同 defect signature 不得重复进入 Repair。

────────────────────────
七、实现 Calibration / Mutation 模式
────────────────────────

实现：

pnpm self-improve:calibration

该模式必须在隔离临时 Git worktree 中工作，不污染用户当前分支。

至少注入一个受控已知缺陷，例如：

- 临时绕过锻造材料检查；
- 临时允许不在场 NPC 执行动作；
- 临时允许任务重复领奖；
- 临时允许叙事成功但 state delta 未提交。

然后验证完整链路：

1. Game Agent 产生暴露问题的轨迹。
2. Deterministic Oracle 或至少两个 Judge 检出问题。
3. Defect Triage 形成稳定缺陷签名。
4. Codex Repair Agent 新增失败回归测试。
5. 新测试在修复前失败。
6. Codex 修改合法性代码。
7. 新测试由失败变通过。
8. 正向 Keep-alive 测试通过。
9. 完整 Quality Gate 通过。
10. 再次 Live Eval 不再出现缺陷。
11. 临时 worktree 被清理。

只有上述流程完整执行，才能报告：

FULL_REPAIR_LOOP_VERIFIED=true

不得通过手动构造“修复成功”JSON 伪造结果。

────────────────────────
八、Codex Repair Backend
────────────────────────

Repair Backend 必须真正调用非交互 Codex：

codex exec --sandbox workspace-write --json --output-schema <schema> -

必须：

- 保存 thread_id。
- 保存 JSONL 事件。
- 保存命令、文件修改和最终消息。
- 支持 codex exec resume <threadId>。
- 有明确超时。
- 不默认 push、merge、deploy。
- 不使用 danger-full-access。
- 不提交 runtime、日志、密钥或 env。
- 只允许在隔离候选 worktree 或明确工作目录修改。
- Repair Agent 必须先添加失败测试再修改生产代码。
- 如果测试修复失败，允许使用同一 threadId 继续修正，而不是创建失忆的新 Agent。

为 Repair Backend 的参数构造、JSONL 解析、resume 和失败处理增加测试。

────────────────────────
九、高效执行策略
────────────────────────

不要盲目对所有案例无限调用模型。

采用分层策略：

第一层：
- 全部案例运行确定性检查。

第二层：
- 全部 required 案例至少运行一次真实 Game AI。

第三层：
- 对可疑、边界和不稳定案例重复三次。

第四层：
- 对候选修复运行完整 Judge Ensemble。

第五层：
- 只有确定性 Gate 全绿才运行 Holdout Live Eval。

复用现有：

- budget guard
- content hash cache
- live result cache
- timeout
- retry
- logical task routing

但缓存不得跨代码版本、Rubric 版本或场景版本错误复用。

────────────────────────
十、完成条件
────────────────────────

本 Goal 不得因为下面任一情况停止：

- 一轮无缺陷。
- 一个 Live Case 成功。
- SSE 和 JSON 能解析。
- Judge 能返回 JSON。
- Smoke 通过。
- Pipeline 文件已经创建。
- 文档已经写完。
- Repair Agent 尚未真实运行。

必须完成：

1. Stop Policy 修正。
2. 12/14 指标语义修正。
3. Campaign 模式实现。
4. Codex 自定义 Subagents 配置。
5. Repair Backend 真实 codex exec 路径。
6. 至少3轮 Campaign，或因明确预算/外部阻塞停止。
7. 所有15个 required Scenario 均有真实执行证据。
8. Judge calibration 好/坏样本均通过。
9. Calibration Mutation 完整修复分支成功。
10. 回归测试由红变绿的证据。
11. Independent Verifier 完成复核。
12. 最终报告包含每个 Agent 和每轮状态。
13. required tests、build 和 E2E 通过。

最终状态只能是：

- FULL_REPAIR_LOOP_VERIFIED
- LIVE_CAMPAIGN_PASS
- IMPLEMENTED_BUT_CALIBRATION_FAILED
- IMPLEMENTED_BUT_LIVE_BLOCKED
- BUDGET_EXHAUSTED
- MAX_ROUNDS_REACHED
- REGRESSION_DETECTED
- HUMAN_RULE_DECISION_REQUIRED

不得再次使用“Pipeline 已就绪”代替完整闭环验证。

现在开始。先并行启动审计 Subagents，等待其结果，再由主 Agent 串行修改代码。不要只输出计划，不等待我继续确认，不自动 push、merge 或部署。