# Codex 叙事安全 Playbook

本文是后续 Codex / 人类开发者处理 VerseCraft 叙事安全任务的操作手册。详细 12 阶段路线见 `docs/narrative-safety-upgrade-plan.md`；本文只规定进入任务、改动边界、测试、CI 与回滚的日常动作。

## 第一原则

**模型输出只是候选，系统才是裁决者。**

执行含义：

- 模型可以写候选叙事，不能直接创建世界事实。
- narrative 是玩家呈现层，不是状态真相源。
- 结构化 delta、registry、validator、fact gate、commitTurn 与 SSE final 才是提交链。
- prompt 只能降低错误概率，不能替代 post-generation validation。

## 进入任务先看什么

叙事安全相关任务先读这些文件，再决定改动点：

- `AGENTS.md`
- `docs/narrative-safety-upgrade-plan.md`
- `docs/turn-engine-architecture.md`
- `docs/ai-governance.md`
- `src/app/api/chat/route.ts`
- `src/lib/turnEngine/validateNarrative.ts`
- `src/lib/turnEngine/commitTurn.ts`
- `src/lib/turnEngine/promptAssembly.ts`
- `src/lib/turnEngine/epistemic/*`
- `src/lib/npcSceneAuthority/*`
- `src/lib/npcKnowledge/*`
- `src/lib/worldFacts/*`
- `src/lib/evals/*`
- `benchmarks/llm-evals/cases.json`
- `benchmarks/narrative-safety/cases.json`

如果任务只要求文档或审计，不要改业务代码。如果任务授权 Code Mode，也先把影响面定位到一个阶段，避免把 `/api/chat`、prompt、validator、eval 和 CI 混成一个不可回滚 PR。

## 不可破坏红线

- `/api/chat` 返回 `200 + text/event-stream`，包括 `keys_missing` degraded 场景。
- SSE 控制帧 `__VERSECRAFT_STATUS__:{...}` 必须继续可被客户端忽略。
- SSE final 帧 `__VERSECRAFT_FINAL__:<json>` 必须继续作为客户端权威 final 覆盖源。
- 最低 DM JSON 四键保持：`is_action_legal`、`sanity_damage`、`narrative`、`is_death`。
- 不绕过 `parseAccumulatedPlayerDmJson`、`normalizePlayerDmJson`、`applyDmChangeSetToDmRecord`、server guards、`applyNpcConsistencyPostGeneration`、`resolveDmTurn`、`validateNarrative`、`commitTurn`。
- PLAYER_CHAT 禁止 reasoner/enhance。新增 director、pacing 或 evidence logic 不得让 `/api/chat` 等离线推理。
- state delta first, narrative second。不要通过解析 narrative 推进任务、章节、位置、道具、关系或危险状态。
- EpistemicFilter 必须回接 prompt。新增 lore、memory、NPC 发言 packet 时默认只传允许事实桶。
- Pacing validator / director 不得阻塞首包。复杂节奏判断只进 final hooks、slow lane、后台 tick 或 eval。

## 0 容忍检查

每个叙事安全 PR 都要能回答这些检查如何被阻断或回归覆盖：

- 未注册 NPC 出现在玩家可见输出：0。
- 未注册地点 / 道具 / 阵营 / 关系：0。
- 不在场 NPC 直接说话：0。
- NPC 说出 must_not_know fact：0。
- 根因 / 终局真相无 fact gate 泄露：0。
- high severity validator issue 仍写入 final：0。
- schema / SSE 契约失败：0。
- prompt injection 导致创建实体或改设定：0。

## Narrative Safety Eval

仓库内置叙事安全 eval：

- cases：`benchmarks/narrative-safety/cases.json`
- rubric：`src/lib/evals/narrativeSafetyRubric.ts`
- runner：`scripts/eval-narrative-safety.ts`
- mock 命令：`pnpm run eval:narrative-safety:mock`
- live 命令：`E2E_AI_LIVE=1 pnpm run eval:narrative-safety -- --mode live --assert --json-out .runtime-data/live-narrative-safety-eval.json`

mock gate 是 PR 必须可见的质量门禁；live eval 不得作为 PR gate。真实 AI gateway 只允许在 `schedule` 或显式 `workflow_dispatch` 环境运行，并且必须依赖 GitHub Secrets，不允许让 fork / PR 依赖 live key。

## CI 与 Branch Protection

PR 推荐开启这些 required checks：

- `verify`
- `E2E contract`
- `mock-chat-guardrails`
- `narrative-safety mock gate`

CI 约定：

- `verify` 只负责基础质量：lint、unit、DB optional check、production build，以及 admin degraded smoke。
- `E2E contract` 只负责 `/api/chat` degraded SSE 与 Playwright contract，不读取 live AI gateway。
- `mock-chat-guardrails` 运行 mock E2E、mock benchmark、chat-quality mock eval，并执行 `pnpm run eval:narrative-safety:mock`。
- `narrative-safety mock gate` 读取 `.runtime-data/eval-narrative-safety-mock.json`，要求所有 pass rate 为 `1`、`severeErrorCount` 为 `0`、`gatePass` 为 `true`。
- mock artifacts 必须上传 `.runtime-data/eval-narrative-safety-mock.json` 和 `.runtime-data/mock-next.log`，便于 PR 失败时追踪。
- live benchmark / eval job 只在 `schedule` 或 `workflow_dispatch` 运行；`pull_request` 不运行，不读取 live secrets。

不要为 PR gate 增加外部 SaaS 依赖。未来可以把 promptfoo 的 javascript assertions 或 factuality assertion 作为附加报告，但仓库内 0 容忍门禁先由自研 rubric 执行。

## 推荐实现顺序

1. 先补 fixture 或 unit test，复现当前缺口。
2. 新增纯函数 validator / registry / extractor，不做 IO，不读 DB，不调用 LLM。
3. 通过调用方传入结构化事实源，不在 validator 内部抓全局状态。
4. 接入 `validateNarrative` 或 `commitTurn` 时保留灰度开关。
5. high severity 必须阻断玩家可见 final；medium 优先局部 rewrite 或 options override；low 只 telemetry。
6. 最后再考虑 prompt packet，且 prompt packet 必须受相同 flag 控制。

## 自动化测试金字塔

从低到高执行：

1. Unit：`pnpm test:unit` 或 `tsx --test <target>.test.ts`，覆盖纯函数和 issue code。
2. Golden：固定 runtime packet 和候选 DM JSON，验证 final / rewrite / issue counts。
3. Contract：`pnpm test:e2e:contract`，保护 SSE、final 覆盖和 degraded response。
4. Mock E2E / benchmark：`AI_PROVIDER=mock pnpm test:e2e:mock` 与 mock benchmark，保护等待体验。
5. Mock eval：`pnpm run eval:chat-quality:mock` 与 `pnpm run eval:narrative-safety:mock`。
6. Live eval：只在有 secrets 的 `schedule` / `workflow_dispatch` 跑；不要让 PR 依赖真实 AI key。

## 每阶段推荐测试命令

| 阶段 | 最小命令 | 扩展命令 |
| ---- | ---- | ---- |
| 文档-only | `git diff --check` | 不需要 `npx eslint .`；若运行也可报告无业务代码变更 |
| validator / registry | `pnpm test:unit`; `npx eslint .` | `pnpm test:e2e:contract` |
| prompt packet | `pnpm test:unit`; `pnpm test:e2e:contract` | mock benchmark；mock eval |
| `/api/chat` final hooks | `pnpm test:unit`; `pnpm test:e2e:contract`; `AI_PROVIDER=mock pnpm test:e2e:mock` | mock benchmark；浏览器 `/play` 验证 |
| pacing / waiting UX | `AI_PROVIDER=mock pnpm benchmark:chat-metrics -- --mode mock --assert-budget --include-all --json-out .runtime-data/chat-benchmark-mock.json` | live benchmark 只在 secrets 环境 |
| eval / CI | `pnpm run eval:narrative-safety:mock`; `pnpm test:ci` | nightly live eval |

## 回滚原则

- 每个新能力必须有独立 flag，例如 `VERSECRAFT_ENABLE_*`。
- 默认先 fail-open 或 report-only，确认误伤率后再升级为阻断。
- 回滚优先关新 flag，不改 schema、不删字段、不重写旧链路。
- CI gate 先 artifact 化，再 required；误伤时降回 report-only。
- prompt 改动回滚要同步关注 stable prompt version/hash。
- 回滚后必须新增匿名 regression case，把这次误伤或漏拦变成长期样本。

## 灰度与 Telemetry

Narrative Safety Kernel、Entity Audit 与 Pacing Validator 的线上灰度入口：

- `VC_ENABLE_NARRATIVE_SAFETY_KERNEL=1`：启用聚合层；设为 `0` 时回到旧提交路径。
- `VC_NARRATIVE_SAFETY_MODE=shadow|soft|hard`：`shadow` 只记录不改 final；`soft` 对 medium/high 尝试 fallback/repair，但不阻断非 0 容忍提交；`hard` 对 0 容忍与 high severity fallback/block commit。
- `VC_ENABLE_ENTITY_HARD_GATE=1`：启用未知实体、未注册 NPC、不在场发言等 0 容忍硬闸；紧急误伤时可先关此项，同时保留 telemetry。
- `VC_ENABLE_PACING_VALIDATOR=1`：启用 final validation 阶段的 pacing gate；不得放到首包前路径。
- `VC_NARRATIVE_SAFETY_LOG_SAMPLE_RATE=0.1`：无 issue 成功回合采样率；有 issue、fallback 或 block 的回合必须记录。

允许记录的字段只包括 `requestId`、`sessionIdHash`、issue code 分布、severity 分布、decision、model、task、lane 和被阻断字段。不得记录完整玩家输入、完整 narrative、完整 prompt、issue detail 或 anchor 原文。

## 完成汇报格式

叙事安全 Code Mode 完成后，汇报必须包含：

- 改动文件。
- 命中的阶段。
- 影响的 invariants。
- 运行过的测试命令与结果。
- 未运行命令及原因。
- 回滚 flag 或回滚 commit 范围。
