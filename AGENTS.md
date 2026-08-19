# AGENTS.md

VerseCraft 仓库的跨编码代理长期约束。本文件是**目标架构契约、风险索引与执行流程**，不是当前实现的自证事实源。

## 1. 先验真，再工作

### 1.1 事实优先级

开始任务前先检查相关代码、契约测试、配置、已同步的 `openspec/specs/*` 和未提交改动。按以下方式处理信息：

1. 用户在当前任务中的明确要求决定本次目标和范围。
2. 代码、测试与运行时配置说明“现在实际如何工作”；主 specs 说明已经接受的产品行为。
3. 本文件规定长期边界、风险检查与应收敛方向；专题文档提供设计背景。
4. 未归档 change 是进行中的计划，不自动代表已实现或已批准的当前事实。

发生冲突时，不得引用本文件证明本文件正确。应指出“当前实现、已接受规范、目标契约”之间的具体差距，以当前代码保护兼容面，并只在任务授权范围内修正。不要把目标愿景写成已实现现状，也不要借文档纠错擅自重构应用。

### 1.2 仓库基线

VerseCraft（文界工坊）是由浏览器客户端、Next.js 服务端和后台 worker 共同组成的 AI 驱动单人互动叙事运行时。玩家以自然语言行动；在线链路生成候选回合并提交结构化状态；后台系统异步推进世界。

- 世界必须按 `worldId` / `mapId` 隔离。当前 `src/lib/worlds/types.ts` 定义暗月与星逆标识，`src/lib/worlds/catalog.ts` 登记「序章·暗月」和「星逆·太初」；实际可进入状态以 catalog、服务端开关和运行时代码为准，不得从本文猜测。
- 游戏语言默认 `zh-CN`，并支持 `en-US`；真实集合与回退规则见 `src/lib/i18n/language.ts`。
- 技术与版本事实源为 `package.json`。当前基线是 Next.js 16 App Router、React 19、TypeScript、Tailwind CSS v4、Zustand 5、PostgreSQL + Drizzle、IndexedDB 与 OpenAI-compatible gateway。
- 使用 `pnpm@10`、Node.js `>=22.22.0`。开发命令为 `pnpm dev`（端口 `666`），lint 使用 `pnpm lint`，不要使用 `next lint`。
- 发布命令为 `pnpm run ship -- "<message>"`；`deploy.sh` 是 Node 脚本。未经用户明确授权，不提交、推送、发布或部署。
- 服务端配置经 `src/lib/config/*`，AI 配置经 `src/lib/ai/config/*`，浏览器配置经 `src/lib/config/publicRuntime.ts`；业务代码不直接读取 `process.env`。
- Next.js 16 的 `params`、`searchParams`、`cookies()`、`headers()` 按异步接口处理。

## 2. 产品与运行时目标架构

以下是必须持续收敛的产品契约。若代码尚未完全兑现，先报告差距，再按任务范围实施。

### 2.1 Writer：唯一玩家可见叙事责任主体

- 所有玩家可见的剧情正文归属于单一逻辑角色 **Writer**。`enhance`、润色、扩写、翻译等可以是 Writer 内部能力或模型档位，但不能成为第二个叙事权威。
- Writer 接收已过滤的世界事实、玩家上下文、规则结果和 Director hint，负责把已裁决结果表达为连贯叙事。
- `PLAYER_CHAT` 优先使用 Function Calling / 结构化终止工具提交完整回合候选。现有终止工具 `submit_player_turn` 的参数仍是模型候选，必须进入既有 normalization、guards、validators、`resolveDmTurn` 与 commit 链路。
- Writer 不负责意图与风险分类、安全政策裁决、伤害/奖励/任务等领域规则，不直接持久化状态，不写权威 `FINAL`，也不执行后台世界推演。
- `PLAYER_CHAT` 禁止路由到 `reasoner` / `enhance`；玩家可见辅助生成不得绕过同一事实、语言与提交边界。
- `reasoner` 只用于离线推演、后台 worker、critic 或 eval 类任务，不得成为在线 Writer 的 fallback。

现状提示：task policy 已以 `writer` 为 `PLAYER_CHAT` 主角色，gateway 默认支持 `submit_player_turn`；部分调用仍沿用 `generateMainReply` 旧命名，且存在独立 `enhance` 能力。修改相关代码时应向上述单一责任边界收敛，但不得为改名破坏兼容链路。

### 2.2 Turn Engine：唯一回合裁决与提交权威

- 在线回合采用可验证的阶段式 workflow，不改成多个 agent 协商状态。
- 结构化字段、领域规则、typed state delta、guards、validators、`resolveDmTurn` 与 commit 决定“发生了什么”；不得解析 narrative 推断或回写状态。
- 模型输出始终是 candidate，不能原样透传、直接落库或直接构造权威终帧。
- 工具调用必须有 schema、权限、世界/场景/前置条件、超时、轮数和幂等边界；工具结果转换为标准 state delta 后仍走统一收口链。
- `src/store/useGameStore.ts` 是主游戏权威状态的唯一客户端 store。辅助 UI/成就 store 可以存在，但不得成为平行游戏状态源。主 store 的 persist 保留 `skipHydration: true`，通过显式 `rehydrate()` 与 `isHydrated` 防护 hydration。

### 2.3 Director：异步世界规划与引导

- Director 在后台 worker 中异步推演世界计划、NPC agenda、节奏与未来事件；可使用有界、最小权限、默认只读的工具调用补充事实。
- Director 候选必须经过解析、确定性 validator/enforcer、持久化与可审计消费，才可成为后续回合的方向性 hint。
- hint 只表达阶段、方向、约束和允许事件类型；具体玩家可见表达由 Writer 完成。
- Director 不直接修改当前玩家回合结果，不提交客户端状态，不规定具体对白或描写，不泄露 sealed/private 事实，也不进入当前回合首字前路径。
- Director、DB 或工具失败必须 fail-open；当前回合照常完成，并记录必要的结构化 telemetry。在线回合只裁决当前行动，world tick 由 final 之后非阻塞入队。

**章节 Director 半程触发**（暗月世界观专属，详见 `CLAUDE.md §5.5`）：

- 半程触发公式：`triggerTurn = max(2, ceil(minTurns/2) + CHAPTER_DIRECTOR_PLAN_TRIGGER_TURN_OFFSET)`。
- 触发后允许 `buildNextChapterSeed` 在 `closeDecision.shouldClose === false` 时也写出暂定 `nextChapterSeed`（基于 narrative_tail / 既有 seed / chapter promise 兜底）。
- `closeDecision.shouldClose === true` 永远立即 build seed。
- chapter-1（`minTurns=3`）→ trigger=3；chapter-2（`minTurns=4`）→ trigger=3。
- 实现：`src/lib/storyDirector/types.ts` 的 `directorPlanTriggerTurnIndex` / `shouldDirectorBuildNextChapterSeed`。

**章节推进门控**（与 `CLAUDE.md §5.5` 对齐）：

- 新增 `src/lib/chapters/advanceGate.ts`：`evaluateChapterAdvanceGate` 返回 `{ ok: true } | { ok: false, reason }`。
- 第一章 → `ok`（标题固定为 `definition.title`，不要求 seed）。
- 第二章及之后 → 必须存在 `directorChapter.nextChapterSeed`，且 `title` 通过 `sanitizeChapterTitleCandidate` 与 `isUniqueChapterTitleKey` 去重。
- gate 失败时 `recordChapterTurnInState` 不调用 `completeChapter` / `enterNextChapter`；`pendingChapterEndId` 与 `chapterTitlesById` 保持原状。

**章节字数 2000-5000**（与 `CLAUDE.md §5.5` 对齐）：

- 每章 `narrative` 累计字数必须在 **2000-5000 字**之间，硬上限统一为 **5200 字**。
- `src/lib/chapters/budget.ts` 的 `CHAPTER_TEXT_BUDGETS` 是唯一预算事实源；不允许重新降低。
- 测试：`src/lib/chapters/__live__/chapterBudget.live.test.ts`。

**章节标题 AI 化**（与 `CLAUDE.md §5.5` 对齐）：

- 第一章标题固定为 `暗月初醒`；不允许任何 seed 或模型输出覆盖。
- 第二章及之后：标题来自 Director 实时生成的 `nextChapterSeed.title`；优先级 `seed.title → closeDecision.nextChapterTitleCandidate → deriveNextChapterTitleCandidate`。
- 所有标题必须通过 `sanitizeChapterTitleCandidate` 与 `isUniqueChapterTitleKey`。

标准数据流：

`玩家行动 → 意图/规则与过滤后上下文 → Writer 结构化候选 → 规范化/校验/提交 → __VERSECRAFT_FINAL__ → 异步 Director → 后续回合 hint`

`章节进行到 trigger turn → Director 实时生成 nextChapterSeed → advanceGate 校验 → chapterTitlesById 写入 → recordChapterTurnInState advance`

## 3. 不可破坏的运行时契约

### 3.1 `/api/chat`、SSE 与 DM JSON

修改前必须检查 `src/app/api/chat/route.ts`、`src/lib/turnEngine/sse.ts`、`src/lib/playRealtime/normalizePlayerDmJson.ts`、`src/features/play/turnCommit/resolveDmTurn.ts` 与 `e2e/chat-sse-contract.spec.ts` 的真实调用链。

- 响应类型保持 `text/event-stream; charset=utf-8`。
- gateway 未配置时仍返回 `200 + SSE`，并带 `X-VerseCraft-Ai-Status: keys_missing`。
- 控制帧格式保持 `__VERSECRAFT_STATUS__:{...}`。
- 权威终帧格式保持 `__VERSECRAFT_FINAL__:<json>`；解析器以终帧覆盖此前累积正文。
- DM JSON 最低必需字段保持 `is_action_legal`、`sanity_damage`、`narrative`、`is_death`。
- 服务端继续规范化其他状态字段，并以 `resolveDmTurn` 的结果作为最终提交对象。
- 不用模板冒充正常 AI 叙事，不用本地通用选项或 `keys_missing` / `CHAIN_EXHAUSTED` 降级冒充正常链路成功。
- 开场只保留一条主请求链，避免本地 fallback 与 SSE 竞争写入。

### 3.2 AI routing、prompt 与日志

- 业务 AI 调用经 `@/lib/ai/logicalTasks` 或 `@/lib/ai/service`，不散落厂商模型 ID。
- 发往 gateway 前移除上行消息中的 `reasoning_content`。
- 要求结构化 JSON 的 system prompt 必须包含字面量 `请严格以 JSON 格式输出`。
- stable prompt 前缀位于动态上下文之前；语义边界变化时检查并按需更新 `VERSECRAFT_DM_STABLE_PROMPT_VERSION`。
- prompt、完整 narrative、原始玩家输入不得进入线上日志；只记录必要的结构化指标与 hash。

#### 3.2.1 叙事质量问题的解决路径（优先级从高到低）

当模型出现叙事质量问题（JSON 格式不稳、字段缺失、`turn_mode` 误选 `narrative_only`、options 数量随机、关键字段为空串、字段类型错配等）时，按下列顺序尝试，**不要直接靠加长 system prompt 或重写文案**：

1. **Structured Outputs / 强制 `tool_choice`**（首选）
   - 用 `text.format: { type: "json_schema", strict: true, schema }` 或 `tools: [{type:"function", function:{strict:true, parameters:...}}]` + `tool_choice: {type:"function", name: ...}` 替换裸 `json_object` 提示。
   - 字段强约束：`turn_mode: const "decision_required"`、`options.minItems=4 / maxItems=4`、`decision_required: const true`，让 provider 在约束解码层物理上禁止输出越界值。
   - 当前 `submit_player_dm` 工具已启用 strict mode（见 `src/lib/ai/schemas/playerDmJsonSchema.ts` 的 `PLAYER_DM_JSON_STRICT_TOOL_PARAMETERS`）。
   - json_schema 与 function_tool 在 Responses API 上互斥（同一 provider 一次只能跑一种约束解码）；优先 tool_call，因为经验上 long structured prompt 下 deepseek-v4-flash 忽略 `text.format.json_schema` 但严格遵循 `tool_choice`。

2. **RAG + 按环节压缩 prompt**（次选）
   - 把全量世界知识从 system prompt 移到 `src/lib/worldKnowledge/retrieval` 的运行时 packet；按当前章节/位置/NPC 召回。
   - stable prompt 优先压缩到 ≤ 600 字 + 高密度规则；dynamic 上下文只保留本回合必要 NPC/任务/线索。
   - 召回层同时跑 FTS（`websearch_to_tsquery`，OR + 前缀匹配中文 token）+ pgvector 余弦；两者得分合并去重。

3. **后置 validator / rewrite / degrade**
   - 用 `@/lib/playRealtime/normalizePlayerDmJson`、`@/lib/turnEngine/validateNarrative` 在服务端收口。
   - 严重违规直接 rewrite / degrade，不放行脏 narrative。

4. **telemetry + eval**（最后）
   - 加 `narrative_validator_issue` 上报与 `pnpm eval:*` 评估，再决定是否需要下一轮 schema 改造。

**严禁**靠加长 system prompt 解决字段稳定问题——经验上稳定率 < 40%。

#### 3.2.2 Structured Outputs 与 Function Calling 的分工

- **目标明确的数据转换、实体提取、情感打标、分类等结构化任务** → 用原生 `text.format: { type: "json_schema", strict: true, ... }`（或 Chat Completions `response_format: { type: "json_schema", ... }`）。Provider 一次只跑一种约束解码；schema 即规范，无需工具栈介入。代表场景：intention_parse、npc_consistency_check、narrative_classify、json_repair。

- **需要给 agent 智能化决策或多步工具协作的任务** → `tool_choice: {type:"function", name:...}` + strict function call。一次只允许调用一个具名工具，provider 在约束解码层强制走函数参数 schema。代表场景：`PLAYER_CHAT` 的 `submit_player_dm`（叙述裁决）、`world_director` 的状态推进工具、`tool_loop` 链上的中间动作。

- **禁止**：把 `json_schema` 和 `tool_choice` 在同一次 provider 调用里同时开启——Responses API 互斥，且语义重复。

#### 3.2.3 当 provider 不响应 schema 约束时的"硬路由"兜底（关键）

deepseek-v4-flash 在长 player-chat prompt 下偶尔忽略 strict function 的字段 `const`（例如仍声明 `turn_mode: "narrative_only"`）。**只靠 prompt 提示或 schema 改造无法解决**——必须叠加以下运行时机制：

1. **运行时工具拦截（Human-in-the-Loop Middleware）**
   - 在 `executePlayerChatStream` 流式收口之后、`phaseParseAndNormalizeCandidate` 之前插入一个 `enforceToolCallShape` 中间件。
   - 输入：tool_call 解码后的 DM JSON 对象。
   - 行为：当 strict schema 声明的 `const` / `minItems` / `maxItems` 字段实际值违反约束时，**在中间件层直接修正**而不是回退到 malformed_dm 路径：
     - `turn_mode: "narrative_only"` → 改为 `"decision_required"`，同时把 `decision_required: true` 强制写入；如果模型给了 ≥1 个 options（`options.length >= 1`）则保留，否则从 narrative 反推 4 条候选。
     - `options.length !== 4` → 用 narrative 摘要 + playerContext 现场补齐；少于 4 用 narrative 推，多于 4 截断。
   - 这一步相当于"provider 约束解码的二次把关"，不依赖模型自觉。

2. **编排框架硬路由（Deterministic Stage Router）**
   - 把 player turn 拆成确定性节点：`parse → guard → HITL middleware → validate → resolveDmTurn → emit`。每个节点只做一件事，输入输出 schema 固定。
   - 当前 `src/app/api/chat/route.ts` 的 phase 函数（`phaseParseAndNormalizeCandidate`、`phaseRepairMalformedCandidate`、`phaseApplyStructuralGuards`、`phaseEnhanceAndSettle`）已具备此结构；HITL middleware 即插入 `phaseParseAndNormalizeCandidate` 与 `phaseApplyStructuralGuards` 之间。
   - 所有"模型可能做不到"的事情都进 middleware 修正，不依赖 system prompt。

#### 3.2.4 DeepSeek / Volcengine Ark 文档

- 主网关模型为 DeepSeek（当前 dev 走 Volcengine Ark agent-plan 的 deepseek-v4-flash，OpenAI Responses API transport）。
- 遇到 provider 层面无法解决的问题（strict schema 接受范围、`thinking` 与 `reasoning_effort` 互斥、Responses SSE 事件格式差异等），查阅 https://api-docs.deepseek.com/zh-cn/guides/responses_api 并同步更新本节。

### 3.3 状态、存档、认证、数据库与 analytics

- 注册成功必须建立服务端 session，不增加仅前端的伪自动登录。
- 跨端存档、主状态或 `RunSnapshotV2` 变化必须定义旧数据迁移、缺省值、世界作用域和回滚兼容；不得让不同世界共享或猜测存档身份。
- 不随意改表名、删字段、改事件名或关键 payload 键。schema 变更必须说明迁移、旧数据兼容、回填/双写及 admin/analytics 影响。
- `analytics_events` 保持 append-only 与 `idempotencyKey` 语义，并保护既有统计、session memory 与 world engine 表。
- 特别保护 `chat_request_finished`、`turn_lane_decided`、`turn_commit_summary`、`narrative_validator_issue`、`world_engine_enqueued`。

### 3.3.1 章节 Director 与字数契约（与 `CLAUDE.md §5.5` 对齐）

- 每章 `narrative` 累计字数必须在 **2000-5000 字**之间，硬上限统一为 **5200 字**。
- 第一章标题固定为 `暗月初醒`；第二章及之后的标题必须来自 Director 实时生成的 `nextChapterSeed.title`。
- `recordChapterTurnInState` 与 `useGameStore.enterNextChapter` 必须调用 `evaluateChapterAdvanceGate`：
  - 第一章 → `ok`；
  - 第二章及之后 → `directorChapter.nextChapterSeed.title` 通过 `sanitizeChapterTitleCandidate` 且 `isUniqueChapterTitleKey`。
- gate 失败时**不得破坏** `chapterTitlesById` / `pendingChapterEndId` / `activeChapterId`；玩家继续累积叙事直到 Director 给有效 plan。
- `nextChapterSeed` 的 promise / mainQuestion / emotionalTone / mustEchoMemoryIds / inheritedThreadIds 是引导参考，Writer 可偏离。

### 3.4 实时性能

预算事实源为 `src/lib/perf/waitingConfig.ts` 与 `docs/perf/chat-latency-budget.md`：

- 点击行动后 `300ms` 内提供可信反馈。
- `firstPerceivedFeedbackMs`、`firstStatusShownMs` p95 ≤ `800ms`。
- 正常 gateway 下 first visible text p50 ≤ `2500ms`、p95 ≤ `5000ms`。
- 普通回合 final p50 ≤ `12000ms`、p95 ≤ `20000ms`。
- 不出现 5 秒以上无反馈等待；`keys_missing` 也要快速产生 status 与可解析 final。

reasoner、DB 写入、analytics rollup、world tick、重型 RAG 或无预算重试不得进入首字前路径。昂贵逻辑放入有 deadline、降级和 telemetry 的 slow lane、final hooks 或后台；性能优化不得删除安全审查、lore、NPC 一致性、认知过滤、生成后校验或最终 JSON 收口。

## 4. `/play`、叙事治理与高风险入口

### 4.1 `/play` 前端边界

- `/play` 是移动端优先的阅读/游玩壳层。`src/app/play/page.tsx` 负责 SSE、回合提交和状态写入接线，不继续堆积大段视觉 JSX。
- `src/features/play/mobileReading/*` 只负责呈现与局部 UI 状态，不接管 SSE、主 store 持久化或业务写回。
- 手动输入、行动选项、选项再生成、天赋和属性升级复用现有 actions，不建立第二套规则。
- 角色与图鉴留在 play shell；设置复用现有入口。除非用户明确要求产品变更，不重新暴露已裁剪的任务栏、游戏指南、灵感手记、仓库、成就或武器入口。
- 保持 E2E 依赖的可见行为与 `data-testid`；改名时同步测试。
- 章节逻辑位于 `src/lib/chapters/*`，UI 位于 `src/features/play/chapters/*`。章节推进只使用规范化结构化信号；状态继续进入主 store、存档槽和 `RunSnapshotV2`，回顾章节只读且不回滚进度。
- 前端实现完成且可运行后，才使用 `frontend-design-review` 的 Mode 1，定向检查用户路径/行动层级、设计 token、可访问性、响应式和可信错误；修正验证过的问题后复查，不以评审为由整体重设计。

### 4.2 叙事与认知治理

- 在现有 `src/lib/epistemic/*`、`src/lib/npcConsistency/*`、`src/lib/turnEngine/epistemic/*` 与 `validateNarrative` 上增量改进，不建立替代链路。
- 文学表达可由 Writer 创作；剧情真相、NPC 关系、事件阶段、地点异常、物品归属和关键历史必须来自可审计、世界作用域正确的事实源。
- 剧情真相没有 `factId`、`source`、`revealTier` 时只可作为 candidate/audit 数据，不能 commit。
- NPC 只能使用 scene-public、actor-scoped、belief/relation graph 与 reveal tier 允许的知识；`rumor`、`hypothesis`、`false_belief` 不得写成确定事实。
- 新叙事治理能力使用 `VERSECRAFT_ENABLE_*` 灰度开关；关闭后不破坏主链。新增 validator 必须是纯函数，外部事实由调用方传入。
- 使用 VerseCraft 自有抽象文风，不复制或引用现成小说原文。新模块覆盖通过、阻断、低 reveal tier、误伤和开关关闭场景，并维护对应 golden scene。

### 4.3 高风险修改

涉及下列任一区域时，先检查生产者、消费者、契约测试、性能和兼容性：

- `/api/chat`、SSE/DM JSON、AI routing/prompt、Function Calling 或 turn commit。
- 主游戏 store/hydration、跨端存档、认证/权限、schema 或 analytics。
- 认知过滤、NPC consistency、生成后 validator、world engine/Director 或等待性能预算。
- `src/lib/registry/*` 只作为 bootstrap seed、fallback 或展示常量；运行时事实优先来自正确世界作用域的 DB、retrieval 与 packet，不把完整世界事实重新硬编码进前端。

## 5. 工作流、OpenSpec 与授权边界

### 5.1 Ask / Code

- 用户要求讨论、评审或方案时只分析，不改代码；用户明确要求实现、修复或修改时按最小可验证路径实施。未说明时默认 Code。
- 只读检查、测试和必要诊断不扩大外部操作授权。没有明确请求时，不创建提交、推送、PR、发布、部署或操作生产数据。

### 5.2 OpenSpec 默认分流

所有编码代理在实现前判断：

- **直接执行**：问答、只读检查、文案/格式修正、无行为变化的单文件小改、已定位 bug 的最小修复、现有 change 内的明确后续任务。
- **轻量 change**：新增/改变可见行为、跨两个及以上模块、存在方案权衡或需要新增/调整测试。先完成 proposal、design、tasks 与 delta spec，再实施。
- **强制 change**：涉及 `/api/chat`、SSE/DM JSON、AI routing/prompt、主 store/hydration、schema、analytics、认知过滤、生成后校验、world tick/Director、认证/权限、跨端存档或等待性能预算。

先用 `openspec list/status/show` 检查是否存在**明确匹配**的未归档 change；仅名称或相邻领域相似不足以复用。存在多个候选或范围不一致时向用户确认，不得把任务塞入无关 change。完成后更新任务证据、验证 change，并按需同步 delta specs；归档仅在用户请求、PR 收口或明确完成流程中执行。proposal 暴露新产品选择、外部权限或明显扩围时停止实施并请求决定。

根 `AGENTS.md` 是跨客户端入口；Codex、Claude Code、Cursor、Kimi Code 的项目 adapters 只做薄适配。需要刷新时使用 `openspec init . --tools codex,kimi,claude,cursor --force`，不要手工复制长期规则到各客户端文件。

## 6. 验证与交付

按改动风险选择最小充分验证：

- 纯文档：作用域内 `git diff --check`；涉及 OpenSpec 时再运行对应 `openspec validate ... --strict`。
- 普通代码：相关 unit tests + `pnpm lint`；跨模块或发布前运行 `pnpm build`。
- `/play` UI：相关 E2E，并验证 `390×844`、`393×852`、`430×932`；优先使用 in-app browser，环境不可用时使用 Playwright 并说明原因。
- `/api/chat`、AI routing、prompt、SSE、状态提交、world tick/Director 或性能：相关 unit/contract tests、`pnpm test:e2e:contract`、`pnpm benchmark:chat:mock`；有条件时再做 live eval。
- 叙事治理：相关 unit/golden tests，并按范围选择 `eval:npc-consistency:mock`、`eval:narrative-safety:mock` 或对应 eval。

不得删除或放宽真实契约断言来制造通过。本任务导致的失败必须修复并复测；预有失败或环境阻塞需报告具体命令、原因和归属。交付时列出实际修改、实际运行的命令与结果，以及未运行验证的阻塞原因；不要声称未执行的检查已通过。

始终保护用户已有改动，一次解决一个清晰问题。行为变化优先补测试；策略优先落在配置、task policy、packet、guard 或 validator，不为“优化”删除兼容层、安全门或 telemetry。
