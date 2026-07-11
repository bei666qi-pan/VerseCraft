# VerseCraft 测评体系全面升级 · 长程执行提示词 v1

> **用法**：在仓库根目录启动 Claude Code，输入一句话：
> 「完整阅读 docs/prompts/eval-overhaul-execution-prompt.md，按其执行测评体系全面升级，直至完成定义（§8）全部满足。」
> 中断后续跑见附录 B。本提示词与 CLAUDE.md 并行生效；冲突时以当前代码与测试为准。

---

## 0. 使命与心智

你是 VerseCraft 测评平台的**总架构师兼唯一执行者**。使命：把现状「mock 冒烟为主、judge 假打分、安全门恒真、命令孤儿化、无趋势留存」的测评体系，重构为**能真实度量并持续守护 AI 中文互动叙事质量**的生产级评测平台，并用升级后的评测发现、修复主链路的真实缺陷。

这是长程任务（数十小时级）。你被明确授权：

- **全程自主决策，不请求人工确认**。唯一例外：触发 §1.2 硬红线时停下说明。
- 不因时间/成本缩水方案；两个可行方案取更彻底的一个。
- 「改动越多越好」的前提是：每步可验证、契约不破、小步 commit 随时可回滚。
- 不声称「已验证」除非命令真实执行并通过；无法验证时写明原因。

核心心智：**测评是产品，不是脚本堆**。它有自己的架构（harness/judge/数据集/门禁/趋势）、自己的质量标准（门必须能红、judge 必须校准、数据必须有 schema）、自己的用户（CI、开发者、未来的你）。

---

## 1. 授权与硬红线

### 1.1 授权（用户已确认，2026-07-08）

1. **范围完全放开**：评测体系（`scripts/`、`benchmarks/`、`src/lib/evals/`、`tests/`、`e2e/`、`.github/workflows/`、`docs/`）可任意重构；评测发现的**主链路缺陷可直接修复**（遵守 §7 纪律）。
2. **允许真实大模型调用**：judge 校准、live 评测按 §6 预算实际执行，不是只留开关。
3. **Git**：直接在 main 小步提交；用户在并行改代码，严格遵守 §1.3。不着急 push。
4. 允许新增 devDependencies（终报告列明理由）；生产依赖仅在确属必要时新增。

### 1.2 硬红线（违反即停，向用户说明）

- 不 push 远端、不 `pnpm run ship`、不部署、不做 Coolify 操作。
- 不 `pnpm db:push`；改 `src/db/schema.ts` 前必须完成迁移影响评估。
- 不读取输出 `.env.local` 密钥值；密钥不进日志、报告、commit。
- 不破坏 `/api/chat` 契约：Node runtime、`text/event-stream`、`__VERSECRAFT_STATUS__`/`__VERSECRAFT_FINAL__` 帧语义、DM JSON 四必填键（`is_action_legal`/`sanity_damage`/`narrative`/`is_death`）、`keys_missing` 时 200+SSE 降级。
- 不把 `reasoner` 接入 `PLAYER_CHAT` 在线链路；不回传 `reasoning_content`。
- 不 `rm -rf`、`git reset --hard`、`git clean`、`git stash` 用户文件；不动用户未提交的无关改动。
- CLAUDE.md 其余禁止事项全部有效。

### 1.3 并行开发的 Git 纪律（重要）

用户在同一仓库并行改代码，因此：

- 提交只 `git add <你改过的明确路径>`，**永不** `git add -A` / `git add .`。
- 每次编辑文件前重读该文件最新内容；发现用户改了同一文件 → 语义合并，绝不覆盖用户改动。
- commit 前 `git status --porcelain` 复核暂存区只含自己的文件。
- 若用户中途 commit 使 HEAD 前移：在新 HEAD 之上继续；同文件冲突以「保留用户意图 + 保留评测功能」为准手工合并。
- 每 Phase 至少一次 commit，消息 `test(eval): ...` / `feat(eval): ...` / `fix(<scope>): ...` / `ci: ...`，正文一句话影响面。
- 不 push。

---

## 2. 经核查的现状事实（2026-07-08 基线）

以下事实已逐文件核实。Phase 0 必须抽查复核（代码可能已漂移）；冲突时以当前代码为准，并把修正写进 `docs/eval/AUDIT-2026-07.md`。

### 2.1 资产清单

| 命令 | 入口 | 机制 | 数据集与规模 | 门禁 | CI |
|---|---|---|---|---|---|
| `eval:chat-quality(:mock)` | `scripts/eval-chat-quality.ts` | HTTP SSE→`src/lib/evals/chatQualityRubric.ts` 规则判定 | `benchmarks/llm-evals/cases.json`（44） | json=1, narrative≥0.95, options≥0.98, optionQuality≥0.95, leakage=1, severe=0 | ✅ mock |
| `eval:narrative-safety(:mock)` | `scripts/eval-narrative-safety.ts` | HTTP SSE→`narrativeSafetyRubric.ts` 10 项规则 | `benchmarks/narrative-safety/cases.json`（28） | 10 项 rate 全=1 + severe=0（**唯一显式硬门** `narrative-safety-mock-gate`） | ✅ mock |
| `eval:npc-consistency(:mock)` | `scripts/eval-npc-consistency.ts` | 纯离线：sceneActorGate+persona packet+checker | `benchmarks/chat-turns/npc_consistency_gate.json`（6） | 4 计数=0 + packet≤1200 字 | ✅ mock |
| `eval:narrative-style(:mock/:live)` | `scripts/eval-narrative-style.ts` | mock=静态文风检测器；live=DeepSeek judge（`judge/judgeExecutor.ts`+`src/lib/evals/liveProvider.ts`） | `benchmarks/narrative-style/cases.json`（26=17 golden_pass+9 must_fail） | mock 全过；**CI 软门 `\|\| true`** | ⚠️ 软 |
| `eval:authenticity` | `scripts/eval-authenticity.ts` | ⚠️ 对 fixture 自身结构打分，不评任何 AI 输出 | 3 个 chat-turns fixture | min_each=3, min_avg=4 | ❌ |
| `eval:player-echo` / `eval:director` / `eval:social-world` | `scripts/eval-*.ts` | 纯离线确定性 | 各自 `__fixtures__`（director ≥20） | 有 fail 退出 1 | ❌ |
| `benchmark:chat:mock` | `scripts/benchmark-chat-metrics.ts` | HTTP SSE 延迟+契约+质量 | `benchmarks/chat-turns/*.json`（10 fixture） | firstStatus≤800 / firstToken≤5000 / final≤20000ms / longGap=0 | ✅ mock |
| `benchmark:game-mechanics` | `benchmarks/game-mechanics/runner.ts` | ⚠️ `evaluateOffline` 启发式 | `scenarios.json`（13） | pass_threshold | ❌ |
| `benchmark:run/:diff/:ci` | `scripts/benchmark-run.mjs` | 加权趋势：narrative 0.40/mechanics 0.35/safety 0.25 | `benchmarks/suite.json` | overall≥0.88，track 0.90/0.85/0.95 | ❌ |
| `test:promptfoo` | `tests/promptfoo/tests/*.test.ts` | 确定性合约断言（8 类） | 内联 | 全过 | ✅ |
| `test:playthrough(:run/:fuzz)` | `src/lib/evals/playthrough/*` | 长程状态机模拟+不变量 | `scenarios.ts`（33 scenario×4 persona） | fuzz 失败率>10% 开 issue（不阻塞） | ✅+nightly |
| `test:deepeval(:run)` | `src/lib/evals/deepEval/*` | Python pytest 桥，不可用降级 node mock judge | `calibration.ts`（40 种子，注明不用于 gate） | — | nightly mock |
| `test:gate(:quick/:ci)` | `scripts/test-gate.mjs` | 本地 L1-L7 统一门 | — | — | ❌ |
| 红队 | `src/lib/evals/redTeam/attacks.ts` | 确定性检测器 | 18 attack / 6 类 | — | ❌（仅 benchmark:run 内） |

Judge 资产：`benchmarks/judge/rubrics/` 下 8 张 rubric（narrative_style_v1、narrative_quality_v2、safety_compliance_v2、game_mechanics_v2、profession_consistency_v1、weapon_economy_v1、task_lifecycle_v1、originium_deduction_v1）+ `benchmarks/rubrics/versecraft_authenticity_judge_v1.json`。多裁判中位数、position 随机化、一致性聚合已实现于 `src/lib/evals/judge/judgeExecutor.ts::aggregateMultiJudge`，但**只有 `eval:narrative-style --mode live` 真正走到**。

Mock 基础设施：`src/lib/ai/mock/`（9 场景：normal_stream/missing_options/malformed_json/empty_stream/disconnect_before_final/slow_first_token/long_chunk_gap/options_only_valid/options_only_invalid），叙事仅 3 段预写文本，靠 `[mock_scenario:xxx]` 标记与关键词确定性分支。

### 2.2 八个结构性缺陷（本次升级的靶心）

- **F1 judge 假打分**：离线路径 `judgeExecutor.ts::evaluateOffline` 是粗糙启发式（多数维度直接 score=3），4 张精细 rubric 的 anchor 从未被真实使用；真 LLM judge 只在 narrative-style live 模式激活，且不进 CI。
- **F2 伪评测**：`eval-authenticity.ts::scoreFixture` 对 fixture 字段结构打分（如 playerContext 非空→4 分），与 AI 输出无关。
- **F3 门禁恒真**：mock 叙事是 3 段干净预写文本，narrative-safety 的 10 项禁词/越界检查必然全过——mock 安全门实质只测 harness 管线，测不了模型。
- **F4 命令孤儿化**：authenticity/player-echo/director/social-world/deepeval/game-mechanics/human-eval/world-retrieval/`benchmark:run`/`test:gate` 全部不在任何 workflow。
- **F5 无趋势留存**：报告写 `.runtime-data/`（gitignored），CI artifact 仅 30 天；无跨运行聚合、无回归曲线；`benchmark:diff` 只能手动指 baseline。
- **F6 计数漂移**：`benchmarks/suite.json` 声称 game_mechanics caseCount=9（实际 scenarios.json=13）；playthrough 注释说 20 scenario（实际 33）。
- **F7 DeepEval 桥脆弱**：依赖 Python pytest，不可用即降级到 F1 的启发式；40 条校准种子从未用于校准任何 gate。
- **F8 软门**：`ci.yml` 中 `eval:narrative-style:mock || true`（注释「phase-6 翻硬门」，一直没翻）。

### 2.3 12 项运行时不变量无离线评测覆盖（缺口清单）

运行时锚点：`src/lib/turnEngine/validateNarrative.ts`（30 种 issue code）、`src/lib/turnEngine/narrativeSafety/`（decide→pass/repair/block_commit + `commitTurn.ts::COMMIT_STATE_CHANGING_FIELDS` 硬剥离）、`src/lib/epistemic/guards.ts::canActorKnowFact`、`src/lib/turnEngine/epistemic/filterFacts.ts`（5 桶投影）、`src/lib/npcConsistency/validator.ts`（13 种违例+保守重写）、`src/features/play/turnCommit/resolveDmTurn.ts`、`src/lib/playRealtime/normalizePlayerDmJson.ts`。

1. **Reveal-tier 门控**：离线只有静态禁词表代理，无用真实 `REVEAL_TIER_RANK`×`maxRevealRank` 驱动的用例。
2. **欣蓝（N-010）特权例外**：无任何用例验证「欣蓝私域不外溢其他 NPC」「可写牵引感但不得说尽根因」。
3. **5 桶认知投影 + `canActorKnowFact` 真值表**：离线只做 narrative 字符串泄漏检测，不断言桶归属/权限矩阵。
4. **block_commit 硬门行为**：无评测驱动 commitTurn 验证结构字段确实被剥离、delta 被中和。
5. **`turn_mode`/`decision_required` 严格校验**（2-4 分叉、非法降级）与 **new_tasks≤3 上限**：全空。
6. **获得语义降级重写**（`downgradeAcquireSemanticsInNarrative`）：playthrough 只有矛盾检测代理，不验证重写行为。
7. **normalizePlayerDmJson 硬门**（缺 4 键→null、代码围栏剥离、泄漏→null 降级路径）：部分覆盖。
8. **选项质量不变量**（恰 4 条、5-20 字、去重、滤 UI 面板项、`localFallbackOptionsAllowed:false` 禁本地罐头）：基本仅运行时。
9. **性能预算不进评测 gate**：safety rubric 采集 firstStatusMs 等但不断言 `CHAT_LATENCY_BUDGET`。
10. **taskPolicy 路由不变量**（`TASK_ROLE_FORBIDDEN`、`TASK_TOOLS_ALLOWED`）：仅单测，不在评测管线。
11. **analytics 事件契约回灌**：无评测把运行时真实发射的 payload 回灌 `eventTaxonomy.ts::validateAnalyticsEventContract` 校验。
12. **persona 串味/主角漂移/性别代词/玩家回声越界**：无确定性离线检测器作用于模型输出（deepEval 只有主观 characterVoice 打分）。

反向缺口：`evals/playthrough/invariants.ts` 的状态机不变量（HP/理智单步跳变、楼层瞬移≤3、softlock、NPC 复活、叙事重复率）是 offline-only，运行时无对应单点校验——需决策补运行时接缝或明确标注 offline-only。

### 2.4 CI 缺口

PR/push 跑相同 job 集（verify / deterministic-assertions / playthrough-mock / e2e-contract / mock-chat-guardrails / narrative-safety-mock-gate / docker-build）；live 仅 nightly schedule + dispatch。24/30 e2e spec 不在 CI（全部 UI/mobile/ending/webview 类）。多数 job 无报告 artifact。Redis open-handle 使 `test:unit` 可能不退出（CLAUDE.md 有说明，无自动化修复；CI 用 `REDIS_URL=""` 回避）。Playwright 浏览器无缓存，3 个 job 每次重装 chromium。`perf/k6/` 4 个负载场景零接线。

### 2.5 运行事实（操作须知）

- HTTP 类评测（chat-quality / narrative-safety / benchmark:chat）需要先起 mock server：`pnpm build` 后 `AI_PROVIDER=mock` 启动（CI 用 `next start` 于 127.0.0.1:3000，本地 `pnpm preview` 于 666），`BENCHMARK_BASE_URL` 指向它；跑完关闭进程。
- 纯离线类（npc-consistency/player-echo/director/social-world/promptfoo/playthrough）秒级、无需 server。
- 全量报告写 `.runtime-data/`（保持 gitignored）；判定用聚合数据才入库。
- live judge 现走 `src/lib/evals/liveProvider.ts::callDeepSeekCompletion`（DeepSeek OpenAI 兼容）；主链路模型经 `src/lib/ai/logicalTasks.ts` 走网关。live 前先 `pnpm verify:ai-gateway`。

---

## 3. 目标体系（北极星）

### 3.1 评测分层

| 层 | 内容 | 运行成本 | 门禁 |
|---|---|---|---|
| **L0 契约冒烟** | SSE 帧、DM JSON schema、keys_missing 降级（现有，加固） | 秒级 | PR 硬门 |
| **L1 确定性规则评测** | 状态 delta 守恒、认知泄漏、选项结构、commit 门行为、路由不变量、analytics 契约——全部复用**运行时真源**（issue code、真值表、预算常量），不搞平行词表 | 秒级 | PR 硬门 |
| **L2 LLM-as-judge 质量** | 文笔/承接/氛围/中文质量/裁决合理性/选项吸引力，走真 judge；mock 模式用确定性特征 judge 保 CI 稳定 | mock 秒级 / live 分钟级 | PR mock 硬门 + nightly live |
| **L3 对抗与安全** | prompt injection、越界索真相、未知实体、元游戏、reveal-tier 抢跑、欣蓝例外——含**能触发脏输出的 mock 场景**（新增对抗性 mock 叙事，治 F3） | 秒级 | PR 硬门 |
| **L4 长程多回合** | 脚本化 persona 驱动 10-30 回合：记忆一致性、任务链、关系漂移、重复率 | 分钟级 | nightly |
| **L5 性能预算** | `CHAT_LATENCY_BUDGET`/`OPTIONS_REGEN_LATENCY_BUDGET` 进评测 gate（mock 断言，live 报告） | 分钟级 | PR mock 硬门 |
| **L6 元评测** | judge 校准（40 种子）、数据集 schema 自检、**门禁可红性证明** | 秒级+一次性 live | PR 硬门 |

### 3.2 横切设计原则

- **统一 harness**：`src/lib/evals/harness/`——`EvalCase`（id/tags/difficulty/source: hand|synth|regression/expect）、Runner（mock|live provider）、Scorer（rule 优先，judge 兜底）、Reporter（JSON 全量→`.runtime-data/`，聚合行→`benchmarks/history/*.jsonl` 入库：ts、git sha、caseCount、passRate、分维 rate、延迟 p50/p95）、Registry、BudgetGuard（live 调用计数与上限）。CLI 参数与现有兼容（`--mode/--assert/--json-out`）。
- **Judge 平台**：经 `src/lib/ai/logicalTasks.ts` 统一入口新增 TaskType（如 `EVAL_JUDGE`：离线专用，primaryRole 建议 reasoner→[main]，temp 0，json；按 CLAUDE.md §6.2 同步扩 `TASK_POLICY`/`TASK_ROLE_FORBIDDEN` 并补测试；**绝不**可从任何在线 route 调用）。JSON prompt 必含字面量「请严格以 JSON 格式输出」；上行剥离 `reasoning_content`。反作弊：逐维 1-5 锚定、要求引用原文证据、3 裁判取中位、position swap、temp 0；live 结果按 (caseId, contentHash) 缓存进 `.runtime-data/judge-cache/`，重跑不重复烧钱。现有 `src/lib/evals/liveProvider.ts`（DeepSeek）可保留为 judge 通道之一或并入网关，你决策并记录理由。
- **门必须能红**：每个硬 gate 必须自带 must-fail 反例集（沿用 narrative-style 的 golden_pass/must_fail 模式并推广到所有评测），并有单测证明「喂坏输出→gate 红」。恒真的门=缺陷。
- **数据即资产**：所有 case 过 schema 校验（自举测试）；synthetic case 必须经第二个 agent 交叉评审；suite.json 计数由脚本从数据集实数生成，杜绝 F6。
- **对齐运行时真源**：L1/L3 检测器 import 运行时模块（issue code、`REVEAL_TIER_RANK`、`canActorKnowFact`、`COMMIT_STATE_CHANGING_FIELDS`、预算常量），不复制平行常量。

---

## 4. 分阶段执行计划

每个 Phase 的收尾动作固定：跑该 Phase 验证命令 → 更新 `docs/eval/PROGRESS.md` → 按 §1.3 commit。

### Phase 0 · 基线核查与骨架（主线程，半天级）

1. `git status` 快照，记录用户当前未提交文件清单（这些文件此后只读回避或语义合并）。
2. 抽查复核 §2 关键事实（F1 的 `evaluateOffline`、F2 的 `scoreFixture`、F8 的 `|| true`、F6 计数、12 缺口锚点文件）；产出 `docs/eval/AUDIT-2026-07.md`（修正漂移后的现状事实，后续 agent 的必读输入）。
3. 起 mock server，跑全部现有 mock 门（`eval:*:mock`、`benchmark:chat:mock`、`test:promptfoo`、`test:playthrough`、`pnpm test:unit`），记录基线通过率与耗时，写入 `benchmarks/history/` 第一行。
4. 建 `docs/eval/PROGRESS.md`（状态机：phase/done/next/blockers/facts-learned）。

### Phase 1 · 统一 harness 内核（主线程实现，架构不 fan-out）

1. 落 `src/lib/evals/harness/{types,runner,scorers,reporter,registry,budgetGuard,history}.ts` + 单测。校验器风格沿用仓库现状（有 zod 用 zod，否则手写守卫，先查证）。
2. 先迁移一个试点（`eval:npc-consistency`）证明设计，再迁移其余 eval 脚本为薄壳（原命令名、原 CLI 参数、原 JSON 输出路径全兼容——CI 不感知迁移）。
3. Reporter 双写：全量→`.runtime-data/eval/`，聚合行→`benchmarks/history/<suite>.jsonl`；`benchmark:diff` 改为默认对比 history 上一行。
4. 验证：迁移前后各 eval 输出 JSON 逐字段 diff 一致；`pnpm test:unit`。

### Phase 2 · 真 judge 接通与校准（主线程 + live 调用，治 F1/F2/F7）

1. 新增 `EVAL_JUDGE` TaskType（§3.2 约束），mock 模式实现**确定性特征 judge**（基于文本特征打分的纯函数，可单测）；live 模式走真模型。
2. `evaluateOffline` 启发式退役：重命名为显式的 feature-heuristic 降级路径并标注「非 judge」，或删除——所有 rubric 评分默认走 judge 平台。
3. 校准：用 `src/lib/evals/deepEval/calibration.ts` 的 40 种子跑 live judge（3 裁判×40，含 prompt 迭代预算见 §6），计算分维 MAE + pass/fail 一致率；目标一致率 ≥0.8，未达标迭代 judge prompt ≤3 轮，仍未达标则记录分析。产出 `docs/eval/JUDGE-CALIBRATION.md`。
4. 重造 `eval:authenticity`：现脚本重命名为 fixture-lint（保留其结构检查价值）；新建真 authenticity 评测——fixture 经 mock/live 链路产出真实 DM 输出后交 judge。
5. `benchmark:game-mechanics` 接真 judge（mock=特征 judge，live=真 judge）。

### Phase 3 · 数据集扩建（**并行 fan-out ×4**，治 F3/F6）

四个 general-purpose agent 按 charter（附录 A）并行，各自独占文件：

- **A**：`benchmarks/llm-evals/`（44→120+，覆盖任务/图鉴/物品/位置/时间/货币/理智/死亡/结算全系统，难度分层）+ `benchmarks/narrative-style/`（26→80+，扩 AI 腔/陈词滥调/重复度/POV 漂移 must-fail）。
- **B**：`benchmarks/narrative-safety/`（28→100+：injection 变体、reveal-tier 分级抢跑、欣蓝例外、未注册实体、元游戏、剧透钓鱼）+ `src/lib/evals/redTeam/attacks.ts`（18→60，6 类均衡）。
- **C**：`benchmarks/game-mechanics/` + `benchmarks/task-eval/`（合计→60+：决策回合、new_tasks 上限、获得语义、武器/职业/原石经济守恒）。
- **D**：**对抗性 mock 场景**——扩展 `src/lib/ai/mock/mockScenarios.ts` 新增脏输出场景（含禁词叙事、泄漏叙事、越权 NPC 发言、畸形字段、罐头选项等），使 L3 安全门在 mock 下**有机会红**（治 F3 的关键）；同步为每个新场景配 must-fail 用例。
- 汇合：主线程跑 schema 自检 + 交叉评审（A↔B、C↔D 互审对方新增 case 的质量与判定正确性）+ 由脚本重新生成 suite.json 计数。

### Phase 4 · 12 项缺口补齐（**并行 fan-out ×3**）

新建 `src/lib/evals/detectors/` 与对应评测命令，import 运行时真源：

- **Agent 1（认知与揭示）**：缺口 1/2/3——reveal-tier 驱动用例、欣蓝例外评测、5 桶投影与 `canActorKnowFact` 矩阵断言（对模型输出而非只对单测输入）。
- **Agent 2（提交与结构）**：缺口 4/5/6/7/8——block_commit 行为驱动评测（喂对抗 DM JSON 断言字段剥离与 delta 中和）、decision_required/new_tasks 上限、获得语义降级、normalize null 降级路径、选项质量不变量。
- **Agent 3（横切）**：缺口 9/10/11/12——延迟预算进 harness gate、taskPolicy 路由不变量离线评测、analytics 契约回灌评测、persona/漂移/性别代词/玩家回声确定性检测器（把 `npcConsistency` 各 validator 的检测逻辑复用为离线检测器）。
- 反向缺口：逐项决策 playthrough 不变量是否补运行时接缝（允许，属主链路改动，走 §7），或标注 offline-only 并写明理由。

### Phase 5 · 长程多回合评测升级

1. playthrough 升级：脚本化 persona 策略（不是自由 agent）、10-30 回合、记忆一致性断言、n-gram 重复率、任务链推进、关系漂移界限；修正「20 vs 33」注释漂移。
2. live 小样本长程：≤5 会话×15 回合真实模型跑通，产出 judge 评分 + 定性报告（进 `docs/eval/`，样本与结论留档）。

### Phase 6 · 主链路缺陷修复（消费前几阶段的红色结果）

新评测标红的每个真实缺陷按 §7 纪律修复。没有红色结果就明确记录「本轮未发现」，不为了改而改。

### Phase 7 · CI 重构与趋势（治 F4/F5/F8）

1. `ci.yml` 分层：PR=全部 L0/L1/L3/L5/L6 + L2 mock（目标 <20min）；nightly=全量 mock + live 小样本（judge 校准回归 + live 评测批次）；dispatch=live 全量。孤儿命令逐一归入某 tier 或显式废弃（写明理由）。
2. narrative-style 翻硬门（去 `|| true`，先确认 mock 全绿）。
3. 每个评测 job 上传报告 artifact；本地运行追加 history 行（CI 不 push，故 history 由本地/你运行时落盘提交）。
4. 基建顺手项：Playwright 浏览器缓存；`test:unit` Redis open-handle 的自动化了断（如 Node 22 `--test-force-exit` 或显式 teardown，验证后采用）；`test:gate.mjs` 与 CI 职责对齐去重。

### Phase 8 · 文档、全量验证、终报告

1. `docs/eval/README.md`（体系总览：分层、命令、数据集、judge、趋势、如何加 case/加门）；更新 CLAUDE.md §3.3 命令表与 §11/§12 清单至新现实。
2. 跑 §8 全量验证矩阵；红了就修，修完重跑，直到绿或逐项写明不可运行原因。
3. 终报告 + PROGRESS 收口。

---

## 5. 多 Agent 编排纪律

- 你是 orchestrator：规划、整合、验证、commit **只在主线程做**；子 agent 不碰 git。
- fan-out 前先落**目录结构与接口契约**（harness types、数据集 schema、检测器接口），子 agent 只在契约内工作。
- 并发 ≤4；探索用 Explore 型（读不写），实现用 general-purpose。
- **两个 agent 永不写同一文件**；charter 中明确独占产出路径（附录 A 模板）。
- 子 agent 产出必须落盘为文件与自验命令结果，不接受只有对话文本的交付。
- 汇合时主线程统一跑 `npx eslint .` + `pnpm exec tsc --noEmit` + 相关单测，全绿才 commit。
- 长上下文防护：探索与大批量 case 生成一律下放子 agent；主线程把阶段结论及时写入 `docs/eval/PROGRESS.md` 与 AUDIT，文件是跨阶段记忆的唯一载体。

---

## 6. Live 模型调用预算

- 前置：`pnpm verify:ai-gateway` 通过才启用 live；失败则完成全部 mock 部分，live 项在报告标注「网关不可用未跑」。
- 预算（软上限，BudgetGuard 强制计数）：judge 校准 ≤360 次（40 种子×3 裁判×≤3 轮 prompt 迭代）；单个 live 评测批次 ≤60 case；长程 live ≤5 会话×15 回合；**单日总调用 ≤2000 次**，超限自动停 live 转 mock 并在报告记录。
- 所有 live 调用经 harness 计数，报告列出总调用数与 token 估算。
- judge 结果按 (caseId, contentHash) 缓存，重跑命中缓存不再调用。
- temp 0、失败重试 ≤2、超时沿用 taskPolicy；密钥只经现有 env 机制读取，绝不打印。

---

## 7. 主链路修复纪律

- 入口唯一：**新评测标红的真实缺陷**。禁止顺手重构、禁止风格性改写。
- 流程：复现（评测红）→ 根因定位 → 最小 diff → 窄单测 → 相关 contract 测试（`pnpm test:e2e:chat` 等）→ 把该缺陷固化为 regression case（source=regression）进数据集。
- 高风险文件（CLAUDE.md §10 清单）修改前列影响面，修改后必跑对应 contract。
- 修复不得改变对外契约与玩家可见行为，除非缺陷本身就是契约违背（此时在报告显著标注）。
- 每个修复独立 commit：`fix(<scope>): <缺陷> (eval: <case-id>)`。

---

## 8. 验证矩阵与完成定义（DoD）

### 8.1 日常验证矩阵

| 改动 | 最低验证 |
|---|---|
| harness / 检测器 / 纯函数 | `pnpm dlx tsx --test <相关.test.ts>` |
| 类型密集改动 | `pnpm exec tsc --noEmit`（build 开了 ignoreBuildErrors，build 不能代替） |
| eval 脚本迁移 | 迁移前后 JSON 输出逐字段 diff + 该命令 mock 全跑 |
| mock 场景 / prompt / judge | 对应 eval mock + must-fail 反例单测 |
| 主链路修复 | 窄单测 + `pnpm test:e2e:chat`（必要时 `:contract`） |
| CI workflow | `node --check` 级语法自检 + 本地等价命令串跑通 |

### 8.2 最终全量验证（顺序执行，全部留存输出）

1. `npx eslint "src/**/*.{ts,tsx}" "e2e/**/*.ts"`
2. `pnpm exec tsc --noEmit`
3. `pnpm test:unit`
4. 全部 `eval:*:mock` + `test:promptfoo` + `test:playthrough` + 新增评测命令 mock
5. `pnpm test:e2e:mock` && `pnpm test:e2e:contract`
6. `pnpm benchmark:chat:mock`
7. `pnpm build`
8. live：`pnpm verify:ai-gateway` + judge 校准报告 + 各 live 小样本批次
9. `pnpm benchmark:run`（新趋势管线端到端）

### 8.3 完成定义（全部满足才算完成）

- [ ] 统一 harness 落地，全部 eval 命令迁移且旧命令名/参数/输出路径兼容
- [ ] 真 judge（live）接通并**实际完成校准**（40 种子一致率报告；≥0.8 或含分析）；mock 确定性 judge 可单测；`evaluateOffline` 启发式退役或显式降级标注
- [ ] `eval:authenticity` 重造为评测真实 AI 输出
- [ ] mock 新增对抗性脏输出场景，安全/质量门在 mock 下**可红**（F3 治愈）
- [ ] 数据集总量 ≥500 case（基线约 180），全部过 schema 自检，suite.json 计数由脚本生成（F6 治愈）
- [ ] §2.3 12 项缺口全部有对应评测，且每个硬 gate 附 must-fail 反例并有「能红」证明
- [ ] 趋势留存：`benchmarks/history/` 落地、`benchmark:diff` 默认对比上一行、nightly 产出
- [ ] CI：孤儿命令全部归 tier 或显式废弃；narrative-style 硬门；PR mock 全绿
- [ ] 主链路缺陷修复清单（或「未发现」记录），每项含 regression case
- [ ] `docs/eval/`（README/AUDIT/JUDGE-CALIBRATION/PROGRESS）齐备；CLAUDE.md 命令表更新
- [ ] §8.2 全量矩阵绿（或逐项写明不可运行原因）
- [ ] 无 TODO、无伪代码、无半成品、无 `any` 规避

---

## 9. 长程执行协议

- 全程用 TodoWrite 维护任务清单；每 Phase 开始前更新。
- `docs/eval/PROGRESS.md` 是断点续跑唯一事实源：每 Phase 结束写 phase/done/next/blockers/facts-learned/最近 commit sha。
- 启动时第一步：`git status` + 检查 `docs/eval/PROGRESS.md` 是否存在——存在即为续跑，从其 next 继续，不重做已完成阶段。
- 失败处理：同一问题连续 3 次尝试失败 → 写入 blockers + 选绕行方案继续，不空转。
- 不提前停止；不问「是否继续」；不把中间态当终态交付。完成 §8.3 才收尾。
- 终报告用 CLAUDE.md §15 格式（改动/文件/验证/风险），额外附：基线 vs 终态指标对比表、live 调用总量、数据集规模对比、门禁清单（PR/nightly/dispatch 各 tier）。

---

## 附录 A · 子 Agent Charter 模板

```text
【使命】一句话目标 + 完成判据
【必读】docs/eval/AUDIT-2026-07.md + <相关契约/schema 文件> + <相关运行时锚点>
【独占产出】<明确文件路径列表，只许写这些>
【禁区】不碰 git；不改 harness 接口；不改他人文件；不新增依赖；发现接口不够用→停下来在汇报中提出，不自行破坏契约
【自验】<该 agent 完成后必须跑通的命令>
【汇报】改动文件清单 / 自验结果 / 发现的问题与建议（写入指定 findings 文件）
```

## 附录 B · 断点续跑提示词（新会话粘贴）

```text
继续执行 docs/prompts/eval-overhaul-execution-prompt.md 定义的测评体系升级长程任务。
先读该提示词与 docs/eval/PROGRESS.md，再 git status + git log --oneline -15 核对进度与用户并行改动，
然后从 PROGRESS 标记的 next 步骤继续。遵守同一授权与硬红线（提示词 §1），完成定义见 §8.3。
不重做已完成阶段；不请求人工确认。
```

## 附录 C · 新增/改造文件规划（fan-out 防冲突基准）

```text
src/lib/evals/harness/            # Phase 1 内核（主线程独占）
src/lib/evals/judge/              # Phase 2 改造（主线程独占）
src/lib/evals/detectors/          # Phase 4（按缺口分 agent 独占子文件）
src/lib/ai/mock/mockScenarios.ts  # Phase 3-D（对抗场景，单 agent 独占）
scripts/eval-*.ts                 # 迁移为薄壳（按命令分配）
benchmarks/<suite>/cases.json     # Phase 3（按 suite 分 agent 独占）
benchmarks/history/*.jsonl        # 趋势聚合（入库；主线程写）
benchmarks/suite.json             # 计数改为脚本生成
.github/workflows/ci.yml          # Phase 7（主线程独占）
docs/eval/{AUDIT-2026-07,PROGRESS,JUDGE-CALIBRATION,README}.md
docs/prompts/eval-overhaul-execution-prompt.md   # 本文件
```
