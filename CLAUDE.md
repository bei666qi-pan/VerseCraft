# CLAUDE.md

> 这是 Claude Code 进入 VerseCraft 仓库后的主上下文入口。目标是让 Claude Code 在**少走弯路、少破坏契约、少制造幻觉**的前提下，完成可直接进入仓库的生产级改动。
>
> 如果本文件与当前代码、`package.json`、测试或仓库文档冲突，以**当前代码与测试**为准；同时在本次任务中修正本文件或明确指出过期点。

---

## 0. 你的角色与优先级

你是 VerseCraft 的 AI 原生全栈维护代理。你的工作不是展示想法，而是在保护现有架构的基础上，用最小、可验证的 diff 交付结果。

冲突时按以下顺序决策：

1. 运行安全、数据安全、密钥安全
2. `/api/chat` SSE / DM JSON 契约、状态持久化契约、数据库兼容性
3. 当前任务目标
4. 性能预算与用户等待体验
5. 视觉风格、叙事风格、局部代码风格

禁止为了“更优雅”“更现代”“更像通用模板”而破坏当前可运行系统。

---

## 1. Claude Code 执行协议

### 1.1 默认工作流

每个任务默认按这个顺序执行：

1. **定位**：用 `Grep` / `Glob` / `rg` 找到目标文件、调用方、被调用方、相关测试。不要凭文件名猜。
2. **阅读**：先读与任务直接相关的代码切片。大文件只读必要区域，再补读类型和消费方。
3. **计划**：复杂任务先列 3–7 个可验证步骤。不要把探索、实现、验证混在一起。
4. **实现**：最小 diff；不做顺手重构；不全仓格式化；不引入无关依赖。
5. **验证**：优先跑目标测试，再按风险扩大到 contract / e2e / build / CI gate。
6. **汇报**：用简体中文说明改动、文件、验证结果、未验证风险。

不要声称“已验证”除非命令真实执行并通过。无法验证时，写清楚原因和替代检查。

### 1.2 事实核查规则

- 不确定的路径、脚本、环境变量、字段、表名、事件名，一律先查仓库。
- 不编造不存在的组件、API、schema、script、环境变量或测试。
- `package.json` 是命令事实源；代码和测试是行为事实源；文档只作为辅助。
- `AGENTS.md`、`.cursorrules` 是辅助上下文；本文件服务 Claude Code，但代码事实高于所有说明文件。

### 1.3 修改边界

- 一次任务只解决一个清晰目标。
- 修 bug 先找根因，再写补丁。
- 重构必须保持外部接口兼容，除非用户明确要求 breaking change。
- 不把局部修复扩展为全局重写。
- 不留 TODO、伪代码、示意实现或半成品。
- 不大面积使用 `any`、`as unknown as` 规避类型问题。

### 1.4 安全操作边界

未经用户明确要求，不要执行：

- `pnpm run ship -- "..."`
- `pnpm db:push`
- `pnpm db:generate` 后直接提交迁移
- 生产部署、生产重启、Coolify 操作
- `rm -rf`、`git reset --hard`、`git clean -fdx`、`docker compose down -v`
- 修改或输出 `.env.local` / 密钥值
- 安装新依赖或切换包管理器

可以读取 `.env.example` 和文档中的变量名；不要把真实密钥写入日志、报错、截图或回复。

---

## 2. 任务模式

### Ask / Plan 模式

用户要求“先分析”“先给方案”“Ask 模式”时：

- 不改代码。
- 给出目标、拟改文件、风险、验证方式。
- 对关键不确定点做仓库核查，不凭记忆回答。

### Code 模式

用户要求实现时：

- 先读相关代码，再修改。
- 优先使用现有模块、类型、工具函数和测试模式。
- 写完后跑最相关的验证命令。

### Debug 模式

用户给出报错、异常、截图或失败测试时：

- 先复现或定位失败路径。
- 解释根因，再改代码。
- 用最窄测试证明修复。

### Review 模式

用户要求 review、审查 PR 或 diff 时：

- 先找 contract、类型、安全、性能、回归风险。
- 不改代码，除非用户要求“顺便修”。
- 结论按严重程度排序。

### Ship 模式

只有用户明确要求提交 / 发布时，才运行：

```bash
pnpm run ship -- "feat: message"
```

`ship` 是发布相关入口；不要手写 `bash deploy.sh` 替代。

---

## 3. 仓库定位与技术事实

### 3.1 产品定位

VerseCraft（文界工坊）是 AI 驱动的中文互动叙事游戏平台原型。当前主世界是「序章·暗月」。玩家用自然语言输入行动，服务端经 `/api/chat` 生成结构化 DM 回合结果，客户端把状态变化落到日志、任务、图鉴、道具、位置、时间、危险推进等系统。

默认所有用户可见文本、UI 文案、叙事、提示和错误信息均使用**简体中文**。

### 3.2 技术栈

- Next.js 16.1.6 App Router，`output: "standalone"`
- React / React DOM 19.2.3
- TypeScript strict，路径别名 `@/* -> src/*`
- Tailwind CSS v4，`@tailwindcss/postcss`，主题 token 在 `globals.css` 的 `@theme`
- Zustand 5 + `idb-keyval`
- PostgreSQL + Drizzle ORM
- Redis：node-redis / Upstash 兼容
- next-auth v5 beta
- one-api / OpenAI-compatible gateway
- 包管理器：`pnpm@10.0.0`
- Node.js：`>=22.22.0`；CI 使用 22.22.2

### 3.3 常用命令

```bash
pnpm dev                         # 本地 dev server，默认 :666，--webpack
pnpm dev:fresh                   # 清理 666 端口后启动 dev
pnpm build                       # 生产构建，standalone output
pnpm preview                     # build 后 next start -p 666
pnpm lint                        # 当前等价 eslint .
npx eslint .                     # 直接 ESLint，推荐在汇报中使用此命令名
pnpm test:unit                   # tsx --test "src/**/*.test.ts"
pnpm dlx tsx --test <file>       # 单个单测，例如 src/lib/chatPurpose.test.ts
pnpm test:e2e:chat               # /api/chat SSE contract E2E
pnpm test:e2e:mock               # mock chat latency + SSE contract
pnpm test:e2e:contract           # chat latency + SSE + play opening contract
pnpm test:ci                     # lint + unit + db check optional + build
pnpm verify:ai-gateway           # AI gateway 配置验证
pnpm probe:ai-gateway            # AI gateway 探测
pnpm benchmark:chat:mock         # mock chat latency budget
pnpm eval:chat-quality:mock      # mock 叙事质量评估
pnpm eval:narrative-safety:mock  # mock 叙事安全评估
pnpm worker:kg:once              # 单次后台 worker
```

注意：`next.config.ts` 当前设置了 `typescript.ignoreBuildErrors: true`。因此 `pnpm build` 不能替代类型检查；涉及复杂 TS 类型时，额外运行：

```bash
pnpm exec tsc --noEmit
```

### 3.4 核心路由拓扑

核心玩家路径固定：

| Route | 职责 |
|---|---|
| `/` | Landing page |
| `/intro` | 背景与规则 |
| `/create` | 角色创建 |
| `/play` | 核心游玩区，SSE 流式回合 |
| `/settlement` | 结局 / 死亡结算 |

可以存在辅助页面，但不要随意改名、合并或迁移以上核心路径职责。

### 3.5 文件组织

```text
src/
├── app/                 # 页面与 API 路由
├── components/          # 通用组件
├── features/play/       # /play 玩法、流式承接、turn commit
├── lib/                 # AI、配置、世界知识、turn engine、工具
├── store/               # 游戏状态
└── db/                  # Drizzle schema 与数据库能力
```

---

## 4. 不可破坏的架构契约

### 4.1 单一主 Store

`src/store/useGameStore.ts` 是唯一主游戏状态源。它承载角色、时间、存档、日志、图鉴、任务、行囊、仓库、位置、货币、游客限制、输入模式、当前选项、菜单、BGM 等状态。

必须遵守：

- 不拆回多个主 store。
- selector 放在 `src/store/useGameStoreSelectors.ts` 或现有 selector 模式中。
- 持久化 store 保持 `skipHydration: true`。
- 通过 `src/components/HydrationProvider.tsx` 手动 `persist.rehydrate()`。
- persisted-dependent UI 必须受 `isHydrated` 或等价状态保护，避免 hydration mismatch。
- 新增持久化字段时，同步检查默认值、`partialize`、`migrate`、反序列化安全、旧存档兼容。

### 4.2 存储韧性链

客户端持久化遵循：

```text
IndexedDB -> localStorage fallback -> memory fallback
```

关键文件：

- `src/lib/resilientStorage.ts`
- `src/lib/idbDebouncedStorage.ts`

不要绕过这条链路直接访问 `localStorage` / `indexedDB` 做主状态持久化。

### 4.3 Next.js 16 与 SSR

- `params`、`searchParams`、`cookies()`、`headers()`、`draftMode()` 按异步接口处理。
- 不要写同步 destructuring 的旧写法。
- 不在 render path 访问 `window`、`document`、`navigator`、`localStorage`、`indexedDB`。
- 浏览器对象只能放在 `useEffect`、事件处理器、或 `typeof window !== "undefined"` guard 内。

### 4.4 配置读取

`src/` 内不要散落直接 `process.env` 读取。按职责使用：

- 服务端：`@/lib/config/serverConfig`、`@/lib/config/envRaw`
- AI：`@/lib/ai/config/env`、`@/lib/ai/config/envCore`
- 浏览器：`@/lib/config/publicRuntime`，且只能暴露 `NEXT_PUBLIC_*`

不要改环境变量名而不保留兼容；不要把密钥变成 `NEXT_PUBLIC_*`。

### 4.5 Tailwind v4 与 UI 风格

- 不新增 `tailwind.config.*`。
- 主题 token 和动画优先放在 `globals.css` 的 `@theme`。
- 延续液态玻璃 / 幽暗科幻 / 半透明高光风格。
- 少硬边框，多 `bg-white/5`、`backdrop-blur-xl`、内阴影、柔和渐变。
- 不把 `/play` 改成普通后台管理面板。
- UI 文案默认简体中文。

---

## 5. `/api/chat` 与 Turn Engine 契约

### 5.1 `/api/chat` 是最高风险路径

`src/app/api/chat/route.ts` 是在线主回合入口。修改前必须读取相关 contract、turn engine、SSE 客户端解析和性能预算文件。

必须保持：

- 运行时为 Node.js。
- 响应类型：`text/event-stream; charset=utf-8`。
- 未配置 AI gateway 时仍返回 `200 + SSE`，并带降级状态，例如 `X-VerseCraft-Ai-Status: keys_missing`。
- 控制帧允许出现：`__VERSECRAFT_STATUS__:{...}`。
- 终帧：`__VERSECRAFT_FINAL__:<json>`。
- 客户端规则：如果出现 final 帧，以 final JSON 覆盖前面积累正文。
- 不把原始模型 JSON 直接透传给前端；必须经过 normalize、guard、validator、turn resolve、commit 收口。

### 5.2 DM JSON 字段兼容

最低必需字段：

```text
is_action_legal
sanity_damage
narrative
is_death
```

服务端 / 客户端兼容字段包括但不限于：

```text
consumes_time
consumed_items
codex_updates
relationship_updates
awarded_items
awarded_warehouse_items
options
currency_change
new_tasks
task_updates
player_location
npc_location_updates
bgm_track
```

改任一字段前，必须同步检查：

- `src/app/api/chat/route.ts`
- `src/lib/playRealtime/normalizePlayerDmJson.ts`
- `src/features/play/stream/*`
- `src/features/play/turnCommit/resolveDmTurn.ts`
- `src/store/useGameStore.ts`
- `e2e/chat-sse-contract.spec.ts`
- 相关单测和快照测试

### 5.3 Turn Engine 心智模型

在线回合按“回合编译器”理解，而不是自由 agent 协商：

```text
玩家输入
  -> 安全 / 校验 / 风险分 lane
  -> control preflight + 意图规范化
  -> runtime lore + prompt assembly
  -> 主模型候选 DM JSON
  -> final hooks + NPC consistency
  -> resolveDmTurn
  -> validateNarrative + commitTurn
  -> __VERSECRAFT_FINAL__
  -> 后台 world tick 入队
```

关键原则：

- **workflow over agent**：主链路是确定阶段与确定输入输出，不是多 agent 随机协商。
- **turn compiler**：模型输出是候选；服务端收口才是权威提交。
- **state delta first**：结构化字段是状态事实，`narrative` 是呈现，不是客户端状态真相源。
- **lane routing**：新增昂贵逻辑先判断是否只进 slow lane、final hooks 或后台 worker。
- **epistemic filtering**：NPC 不应知道 DM-only / player-only 信息。
- **post-generation validation**：一致性问题优先用 validator、rewrite、degrade、telemetry，而不是无限加长 prompt。
- **background world tick**：在线回合只入队，离线 reasoner / world engine 不阻塞首包和 final。

### 5.4 性能预算

`/api/chat` 是实时体验链路。新增逻辑前必须判断是否阻塞首包、首个 status frame、首个可见文本或 final。

长期预算：

| 指标 | 预算 |
|---|---:|
| 本地 UI 提交反馈 | ≤ 300ms |
| first perceived feedback p95 | ≤ 800ms |
| first status shown p95 | ≤ 800ms |
| first visible text p50 | ≤ 2500ms |
| first visible text p95 | ≤ 5000ms |
| normal final p50 | ≤ 12000ms |
| normal final p95 | ≤ 20000ms |
| 完全无反馈等待 | 不超过 5000ms |
| degraded keys_missing final | 快速输出可解析 final |

禁止把新检索、reasoner、长重试、额外模型链直接塞进 `/api/chat` 首字前路径。

---

## 6. AI 服务层契约

### 6.1 统一入口

优先使用：

- `src/lib/ai/logicalTasks.ts`
- `src/lib/ai/service.ts`
- `src/lib/ai/router/execute.ts`

不要在业务代码中直接 `fetch` 大模型网关。

### 6.2 逻辑角色与模型配置

模型通过逻辑角色解析，不在业务代码硬编码厂商模型 ID。

| 角色 | 用途 | 环境变量 |
|---|---|---|
| `main` | 玩家主叙事、规则裁决、记忆压缩默认 | `AI_MODEL_MAIN` |
| `control` | 预检、意图、安全、控制面 | `AI_MODEL_CONTROL` |
| `enhance` | 场景增强、润色 | `AI_MODEL_ENHANCE` |
| `reasoner` | 离线世界构建、剧情推演、管理洞察 | `AI_MODEL_REASONER` |

关键约束：

- `PLAYER_CHAT` 禁止路由到 `reasoner` / `enhance`。
- `reasoner` 只用于离线 / worker / world director，不进入在线主叙事流。
- 上行消息必须剥离 `reasoning_content`。
- 要求 JSON 输出的 system prompt 必须包含字面量：`请严格以 JSON 格式输出`。
- 新增 AI task 时，扩展 `TaskType`、`TASK_POLICY`、`TASK_ROLE_FORBIDDEN`，并补测试或说明验证。

### 6.3 Prompt 改动策略

Prompt 是全局行为面，不是无成本文案文件。

修改 prompt 前先判断能否通过以下方式解决：

1. 更窄的 runtime packet
2. 结构化 delta / typed field
3. guard / validator
4. post-generation rewrite / degrade
5. telemetry + eval

如果确实改变 stable prompt 的语义边界，检查是否需要更新 `VERSECRAFT_DM_STABLE_PROMPT_VERSION` 或相关兼容机制。

---

## 7. 世界知识、叙事与一致性

### 7.1 World Knowledge 双源模式

- `src/lib/worldKnowledge/`：运行时事实源，DB-backed，RAG retrieval，canon / reveal system。
- `src/lib/registry/`：bootstrap / fallback / seed data。

不要把 registry 内容硬编码进页面 JSX。页面通过 worldKnowledge、store selector 或现有数据入口消费。

### 7.2 NPC 认知边界

涉及 lore、memory、NPC 发言、玩家私密信息、真相揭示时，默认检查：

- `src/lib/epistemic/*`
- `src/lib/turnEngine/epistemic/*`
- `src/lib/npcConsistency/*`
- `src/lib/turnEngine/validateNarrative.ts`

不要把全局真相摘要直接塞进 prompt 后指望模型自觉保密。

### 7.3 叙事安全与 eval

涉及 narrative 行为、NPC 一致性、世界事实泄漏、prompt injection、未知实体、任务状态、commit safety 时，优先补或运行：

```bash
pnpm eval:chat-quality:mock
pnpm eval:narrative-safety:mock
pnpm eval:npc-consistency:mock
```

如只改纯函数，先跑对应单测；如改主链路，再扩大到 mock/e2e/eval。

---

## 8. 数据库、Analytics 与后台 Worker

### 8.1 Schema 修改原则

`src/db/schema.ts` 是高风险文件。修改前必须确认：

- 是否影响历史数据
- 是否需要 migration / 回填 / 双写期
- 是否影响 admin 统计口径
- 是否影响 worker / world engine
- 是否影响 analytics event payload

不要随意改表名、删字段、改事件名、改关键 payload 键。

### 8.2 重要 analytics / world engine 事实

需要特别保护：

- `analytics_events` append-only 基础表
- `idempotencyKey`
- `chat_request_finished`
- `turn_lane_decided`
- `turn_commit_summary`
- `narrative_validator_issue`
- `world_engine_enqueued`
- `world_engine_runs`
- `world_engine_event_queue`
- `world_engine_agenda_snapshots`
- `game_session_memory`

新增事件应具备稳定命名、可序列化 payload、非阻塞写入和失败吞吐策略。

### 8.3 Worker 边界

后台世界推进由 worker 消费，不要把离线 reasoner 重新塞回 `/api/chat` 首包路径。

常见入口：

- `scripts/vc-worker.ts`
- `src/lib/worldEngine/*`
- `src/lib/turnEngine/enqueueBackgroundTick.ts`

---

## 9. `/play` 与移动阅读壳层

`/play` 是核心游玩 UI，不是普通聊天页。

修改前按范围阅读：

- `src/app/play/page.tsx`
- `src/features/play/stream/*`
- `src/features/play/turnCommit/*`
- `src/features/play/mobileReading/*`
- `src/store/useGameStore.ts`
- `src/store/useGameStoreSelectors.ts`

约束：

- 交互锁定和流式视觉由显式 phase 驱动：`idle -> waiting_upstream -> streaming_body -> turn_committing -> tail_draining -> error`。
- 不用临时布尔值替代 phase 语义。
- 开场只允许一个主 `/api/chat` 请求；本地开场文案只能是超时 fallback，不能与真实 SSE 竞争写入。
- 选项、手动输入、天赋、菜单打开必须走现有 `page.tsx` 接线和 store 逻辑。
- 图鉴、角色、设置等移动壳层入口不得绕过现有状态与数据源。
- 保留关键 `data-testid`；如改名，同步改测试。

流式解析规则：

- 优先使用 `indexOf` + `slice`、已有 SSE frame 工具和 parser。
- 不使用复杂脆弱正则猜 JSON 边界。
- 流式中避免滥用 `scrollTo({ behavior: "smooth" })`。
- thinking 态、status frame、可见正文之间不要闪烁。

---

## 10. 高风险文件

以下文件修改必须有强理由、强自检、强兼容：

1. `src/app/api/chat/route.ts`
2. `src/app/play/page.tsx`
3. `src/store/useGameStore.ts`
4. `src/components/HydrationProvider.tsx`
5. `src/lib/resilientStorage.ts`
6. `src/lib/idbDebouncedStorage.ts`
7. `src/db/schema.ts`
8. `src/lib/playRealtime/playerChatSystemPrompt.ts`
9. `src/lib/ai/tasks/taskPolicy.ts`
10. `src/lib/turnEngine/*`
11. `next.config.ts`
12. `Dockerfile`
13. `docker-compose.yml`
14. `.github/workflows/*`

修改这些文件前，先列出影响面；修改后至少跑相关 contract 或说明无法跑的原因。

---

## 11. 按任务类型的上下文读取清单

### 11.1 `/api/chat` / SSE / DM JSON

先读：

- `docs/turn-engine-architecture.md`
- `src/app/api/chat/route.ts`
- `src/lib/turnEngine/sse.ts`
- `src/features/play/stream/sseFrame.ts`
- `src/lib/playRealtime/normalizePlayerDmJson.ts`
- `src/features/play/turnCommit/resolveDmTurn.ts`
- `e2e/chat-sse-contract.spec.ts`
- `src/lib/perf/waitingConfig.ts`

验证优先级：

```bash
pnpm dlx tsx --test src/lib/turnEngine/sse.test.ts
pnpm dlx tsx --test src/features/play/stream/sseFrame.test.ts
pnpm test:e2e:chat
pnpm test:e2e:contract
pnpm benchmark:chat:mock
```

### 11.2 AI 路由 / 模型 / Prompt

先读：

- `docs/ai-architecture.md`
- `docs/ai-gateway.md`
- `src/lib/ai/logicalTasks.ts`
- `src/lib/ai/service.ts`
- `src/lib/ai/tasks/taskPolicy.ts`
- `src/lib/ai/stream/sanitize.ts`
- `src/lib/playRealtime/playerChatSystemPrompt.ts`

验证优先级：

```bash
pnpm test:unit
pnpm verify:ai-gateway
pnpm eval:chat-quality:mock
pnpm eval:narrative-safety:mock
```

### 11.3 Store / Hydration / 持久化

先读：

- `src/store/useGameStore.ts`
- `src/store/useGameStoreSelectors.ts`
- `src/components/HydrationProvider.tsx`
- `src/lib/resilientStorage.ts`
- `src/lib/idbDebouncedStorage.ts`
- 相关页面消费方

检查：

- 默认值
- migrate / partialize
- 旧存档兼容
- SSR 安全
- `isHydrated` guard
- 严格模式双挂载幂等性

### 11.4 `/play` UI / 移动阅读壳层

先读：

- `src/app/play/page.tsx`
- `src/features/play/mobileReading/*`
- `src/features/play/stream/*`
- `src/components/*` 中直接相关组件
- `e2e/play-open.spec.ts`

验证：

```bash
npx eslint .
pnpm test:e2e:contract
```

涉及移动端视觉时，至少考虑 `390x844`、`393x852`、`430x932` 三档视口；能用浏览器验证时，用截图或 DOM 证据确认。

### 11.5 DB / Admin / Analytics

先读：

- `src/db/schema.ts`
- `docs/environment.md`
- `src/lib/analytics/*`
- `src/app/api/admin/**/route.ts` 或相关 admin 文件
- 相关 migration / ensure-runtime-schema 脚本

验证：

```bash
pnpm db:check:optional
pnpm test:admin:api
pnpm test:admin:perf
```

不要在未确认环境的情况下运行 `pnpm db:push`。

### 11.6 Docker / 部署 / CI

先读：

- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- `scripts/start-production.mjs`
- `docs/deployment-coolify.md`
- `docs/environment.md`

约束：

- 保持 Next standalone。
- 保持 pnpm 10。
- 不随意引入 Docker Hub syntax frontend 依赖。
- 不破坏 Coolify 环境变量注入与 `MIGRATE_ON_BOOT` 语义。

---

## 12. 验证策略

优先跑最窄、最快、最相关的验证；高风险改动再扩大。

| 改动范围 | 最低验证 |
|---|---|
| 纯函数 / parser / validator | `pnpm dlx tsx --test <相关.test.ts>` |
| 类型密集 TS 改动 | `pnpm exec tsc --noEmit` + 相关单测 |
| UI / 组件 | `npx eslint .` + 相关 Playwright / 手动浏览器验证 |
| `/api/chat` contract | `pnpm test:e2e:chat`，必要时 `pnpm test:e2e:contract` |
| 性能路径 | `pnpm benchmark:chat:mock`，必要时 live benchmark 由用户提供环境后运行 |
| 叙事 / safety / NPC | `pnpm eval:chat-quality:mock`、`pnpm eval:narrative-safety:mock`、`pnpm eval:npc-consistency:mock` |
| DB schema | `pnpm db:check:optional` + migration/兼容说明 |
| 全局回归 | `pnpm test:ci` |

若 `pnpm test:unit` 因 Redis open handle 等原因不自动退出，但测试输出已完成，汇报中必须说明观察到的实际情况，不把“进程未退出”伪装成完全无问题。

---

## 13. 代码风格

- TypeScript 优先显式类型，少用隐式宽类型。
- import 优先使用 `@/*`。
- 保持函数职责单一。
- helper 小而稳，不做炫技抽象。
- 注释只在有价值时写，默认中文。
- 错误信息、UI、剧情默认中文。
- 不批量格式化无关文件。
- 不复制粘贴已有逻辑；能复用就复用。
- 不为了通过 lint 删除必要防护逻辑。

---

## 14. 禁止事项速查

- 不恢复旧双 store。
- 不把 registry / 世界观内容硬编码到页面 JSX。
- 不绕过 AI service 直接调模型。
- 不在业务代码写死模型厂商 ID。
- 不把 `reasoner` 接入 `PLAYER_CHAT` 在线主链路。
- 不把 `reasoning_content` 回传上游或前端。
- 不用复杂正则硬拆流式 JSON。
- 不靠解析 `narrative` 推导客户端状态。
- 不破坏 `/api/chat` SSE final/status 帧语义。
- 不新增 `tailwind.config.*`。
- 不在 render path 访问浏览器对象。
- 不把密钥暴露到 `NEXT_PUBLIC_*`。
- 不在不验证的情况下改 schema / migrations / analytics 口径。
- 不为修一个局部问题重写整条主链路。

---

## 15. 完成定义

任务完成必须满足：

- 与当前技术栈一致。
- 不破坏核心路由、SSE、DM JSON、store、hydration、SSR、DB 兼容性。
- 改动范围与任务目标匹配。
- 有目标验证，或明确说明未验证原因。
- 关键风险已告知。
- 用户可直接把结果带回仓库继续使用。

默认回复格式：

```text
## 改动
- ...

## 文件
- path/to/file.ts：...

## 验证
- ✅ command
- ⚠️ 未运行：原因

## 风险 / 后续
- ...
```

保持简体中文、客观、具体。不要输出空泛保证。
