# AGENTS.md

VerseCraft 仓库的长期 AI 编码约束。开始工作前先读本文件；若说明与代码冲突，以当前代码为准，并在任务范围允许时同步修正文档。

## 1. 产品与技术基线

VerseCraft（文界工坊）是单机、浏览器内运行、AI 驱动的中文互动叙事游戏平台原型。当前主世界为「序章·暗月」；玩家通过自然语言行动，服务端生成结构化 DM 回合，客户端提交状态变化。默认 UI 文案使用简体中文。

技术栈固定为：Next.js 16 App Router、React 19、Tailwind CSS v4、Zustand 5、PostgreSQL + Drizzle、IndexedDB、OpenAI-compatible gateway。除非任务明确要求，不替换主干技术或建立平行架构。

- 使用 `pnpm@10`、Node.js `>=22.22.0`。
- 本地开发：`pnpm dev`，默认端口 `666`；生产默认端口 `3000`。
- lint：`pnpm lint` 或 `npx eslint .`，不要使用 `next lint`。
- 发布：`pnpm run ship -- "<message>"`；`deploy.sh` 是 Node 脚本，不要用 Bash 执行。
- 服务端配置只经 `src/lib/config/*`，AI 配置经 `src/lib/ai/config/*`，浏览器配置经 `src/lib/config/publicRuntime.ts`；业务代码不要直接读取 `process.env`。
- Next.js 16 的 `params`、`searchParams`、`cookies()`、`headers()` 均按异步接口处理。

## 2. 核心架构原则

1. **Workflow over agent**：在线回合是可验证的阶段式工作流，不改成多 agent 协商系统。
2. **State delta first**：结构化字段、guard 与 `resolveDmTurn` 是状态真相源；不要解析 narrative 推断状态。
3. **Model output is candidate**：模型 JSON 必须经过规范化、变更折叠、validator 与 turn commit，不能原样透传。
4. **Epistemic filtering**：NPC 知识须在生成前过滤、生成后校验，不能依赖 prompt 自觉。
5. **Background world tick**：在线回合只裁决当前回合；离线推演与世界推进交给后台 worker。
6. **Single store**：`src/store/useGameStore.ts` 是唯一主游戏 store，不建立平行状态源。
7. **Small verified changes**：先确认输入、消费者、兼容面与测试，再修改；大枢纽文件优先抽离后加行为。

详细 Turn Engine 设计见 `docs/turn-engine-architecture.md`。

## 3. 不可破坏的契约

### 3.1 `/api/chat` 与 SSE

真实契约入口：

- `src/app/api/chat/route.ts`
- `src/lib/playRealtime/normalizePlayerDmJson.ts`
- `src/features/play/turnCommit/resolveDmTurn.ts`
- `src/lib/turnEngine/sse.ts`
- `e2e/chat-sse-contract.spec.ts`

必须保持：

- 响应类型为 `text/event-stream; charset=utf-8`。
- 网关未配置时仍返回 `200 + SSE`，并带 `X-VerseCraft-Ai-Status: keys_missing`。
- 控制帧格式：`__VERSECRAFT_STATUS__:{...}`。
- 权威终帧格式：`__VERSECRAFT_FINAL__:<json>`；解析器以终帧覆盖此前累积正文。
- DM JSON 最低必需字段：`is_action_legal`、`sanity_damage`、`narrative`、`is_death`。
- 服务端继续规范化其他状态字段，并以 `resolveDmTurn` 的结果作为最终提交对象。
- 不用模板冒充正常 AI 叙事，不用本地通用选项伪造正常链路成功。

### 3.2 AI routing 与 prompt

- 业务调用经 `@/lib/ai/logicalTasks` 或 `@/lib/ai/service`，不要散落模型厂商 ID。
- `PLAYER_CHAT` 禁止使用 `reasoner` / `enhance`；reasoner 只用于离线任务或 worker。
- 发往 gateway 前必须移除上行消息中的 `reasoning_content`。
- 要求结构化 JSON 的 system prompt 必须包含字面量 `请严格以 JSON 格式输出`。
- stable prompt 前缀必须位于动态上下文之前；语义边界变化时检查 `VERSECRAFT_DM_STABLE_PROMPT_VERSION`。
- prompt、完整 narrative、原始玩家输入不得写入线上日志；只记录必要的结构化指标与 hash。

### 3.3 状态、存档与认证

- Zustand persist 保留 `skipHydration: true`，通过显式 `rehydrate()` 与 `isHydrated` 防护 hydration。
- 开场只保留一条主请求链，避免本地 fallback 与 SSE 竞争写入。
- 注册成功应建立服务端 session，不添加仅前端的自动登录补丁。
- 改跨端存档或状态结构时，必须说明旧数据迁移与兼容策略。

### 3.4 数据库与 analytics

- 不随意改表名、删字段、改事件名或关键 payload 键。
- `analytics_events` 保持 append-only 与 `idempotencyKey` 语义。
- 保持既有统计、session memory 与 world engine 表的兼容性。
- 特别保护 `chat_request_finished`、`turn_lane_decided`、`turn_commit_summary`、`narrative_validator_issue`、`world_engine_enqueued`。
- schema 变更必须同时说明迁移、旧数据兼容、回填/双写需求及 admin/analytics 影响。

### 3.5 实时性能

预算事实源为 `src/lib/perf/waitingConfig.ts` 与 `docs/perf/chat-latency-budget.md`：

- 点击行动后 300ms 内提供可信反馈。
- `firstPerceivedFeedbackMs`、`firstStatusShownMs` p95 ≤ 800ms。
- 正常网关下 first visible text p50 ≤ 2500ms、p95 ≤ 5000ms。
- 普通回合 final p50 ≤ 12000ms、p95 ≤ 20000ms。
- 不出现 5 秒以上无反馈等待；`keys_missing` 也要快速产生 status 与可解析 final。

不得把 reasoner、DB 写入、analytics rollup、world tick、重型 RAG 或无预算重试放到首字前路径。昂贵逻辑优先放入 slow lane、final hooks 或后台，并具备 deadline、降级与 telemetry。性能优化不得删除安全审查、lore、NPC 一致性、认知过滤、生成后校验或最终 JSON 收口。

## 4. 叙事治理

- 在现有 `src/lib/epistemic/*`、`src/lib/npcConsistency/*`、`src/lib/turnEngine/epistemic/*` 与 `validateNarrative` 上增量改进，不建立替代链路。
- 文学描写可自由生成；剧情真相、NPC 关系、事件阶段、地点异常、物品归属和关键历史必须来自可审计事实源。
- 剧情真相没有 `factId`、`source`、`revealTier` 时只能作为 candidate/audit 数据，不能 commit。
- NPC 仅能使用 scene-public、actor-scoped、belief/relation graph 与 reveal tier 允许的知识；`rumor`、`hypothesis`、`false_belief` 不得写成确定事实。
- 新增叙事治理能力必须有 `VERSECRAFT_ENABLE_*` 灰度开关；关闭后不破坏主链路。
- 新增 validator 必须是纯函数：无 IO、数据库、文件、网络或 LLM 调用；外部事实由调用方传入。
- 使用 VerseCraft 自有抽象文风，不复制或引用现成小说原文。
- 新模块需覆盖通过、阻断、低 reveal tier、误伤与开关关闭场景；维护对应 golden scene。

执行细节见 `docs/codex-narrative-safety-playbook.md`。

## 5. `/play` 前端边界

`/play` 是移动端优先的阅读/游玩壳层。

- `src/app/play/page.tsx` 负责 SSE、回合提交、状态写入等接线，不继续堆积大段视觉 JSX。
- `src/features/play/mobileReading/*` 只负责呈现与局部 UI 状态，不接管 SSE、store 持久化或业务写回。
- 手动输入、行动选项、选项再生成、天赋和属性升级必须复用现有 actions，不建立第二套规则。
- 角色与图鉴留在 play shell；设置继续使用现有设置入口，不新增路由。
- 不重新暴露已裁剪的任务栏、游戏指南、灵感手记、仓库、成就、武器入口，除非用户明确要求产品变更。
- 保持 E2E 依赖的可见行为与 `data-testid`；改名时同步测试。

章节系统：

- 逻辑在 `src/lib/chapters/*`，UI 在 `src/features/play/chapters/*`。
- 章节推进只使用规范化结构化信号，不解析 narrative，也不要求 AI 新增必填字段。
- 章节状态继续进入主 store、存档槽和 `RunSnapshotV2`；旧存档须可迁移。
- 回顾章节是只读操作，不回滚当前进度。

前端实现完成且可运行后，按仓库级指令使用 `frontend-design-review` 的 Mode 1 做定向复核，不在初始设计或实现阶段加载它。

## 6. 领域规则与文件落点

### 6.1 游戏逻辑

时间系统：1 次行动 = 1 游戏小时；只有明确满足条件时 `consumes_time` 才能为 `false`。

物品/道具：消耗型资源消耗后必须触发前端状态更新。新增道具逻辑时同步检查行囊、仓库、消耗、掉落、奖励入库、图鉴/任务联动。

实体状态：NPC / 诡异的状态保持实体级隔离（`combatPower`、`favorability`、`currentLocation`、`isAlive`）。

玩家状态：新增或修改核心属性时检查初始值、上限、结算页展示、存档/读档、云/本地同步、DM prompt context 拼接。

### 6.2 文件落点

- 页面：`src/app/*`
- 组件：`src/components/*`
- 主游戏状态：`src/store/useGameStore.ts`
- 注册表/世界观：`src/lib/registry/*`
- 工具与基础能力：`src/lib/*`
- API：`src/app/api/**/route.ts`
- DB：`src/db/*`

铁律：静态资料进 registry 不进页面硬编码；跨页面逻辑进 lib 不复制粘贴；持久态进 Store，短生命周期 UI 留组件内部。

## 7. 高风险入口

修改下列区域前必须先检查调用链、契约测试与性能影响：

- `src/app/api/chat/route.ts`：SSE 主工作流、final hooks、analytics、world tick enqueue。
- `src/app/play/page.tsx`：客户端解析、状态应用与回合提交。
- `src/store/useGameStore.ts`：唯一游戏状态源、hydration、存档。
- `src/lib/playRealtime/playerChatSystemPrompt.ts`：stable/dynamic prompt 边界。
- `src/features/play/turnCommit/resolveDmTurn.ts`、`src/lib/dmChangeSet/*`、`src/lib/turnEngine/*`：权威回合收口。
- `src/db/schema.ts`、`src/lib/analytics/*`：数据兼容与统计口径。
- `src/lib/epistemic/*`、`src/lib/npcConsistency/*`、`src/lib/worldEngine/*`：认知一致性与后台推进。

`src/lib/registry/*` 只适合作为 bootstrap seed、fallback 或展示常量；运行时事实优先来自 DB + retrieval + packet，不把完整世界事实重新硬编码进前端。

## 8. 工作流分流

### Ask / Code

- 用户要求“先讨论、评审、给方案”或明确 Ask 模式：只分析、列计划、影响文件、风险和验证方式，不写代码。
- 用户明确要求实现、修复、修改或使用 Code 模式：按最小可验证路径直接实施。
- 未说明时默认 Code 模式。

### OpenSpec

- **直接执行**：问答、只读检查、文案/格式修正、无行为变化的单文件小改、已定位 bug 的最小修复、现有 change 内的明确后续任务。
- **轻量 change**：新增/改变可见行为、跨两个及以上模块、需要方案权衡或新增/调整测试。先创建或更新 proposal、design、tasks 与 delta spec，再实施。
- **强制 change**：涉及 `/api/chat`、SSE/DM JSON、AI routing/prompt、主 store/hydration、schema、analytics、认知过滤、生成后校验、world tick、认证/权限、跨端存档或等待性能预算。
- 先复用匹配的未归档 change；完成后同步 delta specs。归档仅在用户请求、PR 收口或明确完成流程中执行。
- proposal 暴露新的产品选择、外部权限或明显扩围时，停止实施并请求用户决定。

## 9. 验证与交付

按改动风险选择最小充分验证：

- 纯文档：`git diff --check`。
- 普通代码：相关 unit tests + `pnpm lint`；跨模块或发布前运行 `pnpm build`。
- `/play` UI：相关 E2E，并验证 `390×844`、`393×852`、`430×932`；优先使用 in-app browser，环境不可用时用 Playwright 并说明原因。
- `/api/chat`、AI routing、prompt、SSE、状态提交、world tick 或性能：相关 unit/contract tests、`pnpm test:e2e:contract`、`pnpm benchmark:chat:mock`；有条件时再做 live eval。
- 叙事治理：相关 unit/golden tests，并按范围选择 `eval:npc-consistency:mock`、`eval:narrative-safety:mock` 或其他对应 eval。

测试规则：

- 不删减或放宽真实契约的断言来制造通过。
- 正常链路测试不得用 `keys_missing`、`CHAIN_EXHAUSTED` 等降级结果冒充成功；降级由专门测试覆盖。
- 本任务导致的失败必须修复并复测。环境阻塞或预有失败需报告具体命令、原因和归属，不得声称全绿。
- 交付说明列出实际运行的命令与结果；无法运行的验证说明阻塞原因。

## 10. 改码纪律

- 一次只解决一个清晰、可验证的问题；不要顺手重写架构。
- 保护用户已有改动，不覆盖无关 worktree 内容。
- 行为变化优先补测试；无法自动验证时说明原因。
- 策略优先落在配置、task policy、packet、guard 或 validator，不把同类规则散落到业务代码。
- 不为“优化”删除兼容层、安全门或 telemetry。
