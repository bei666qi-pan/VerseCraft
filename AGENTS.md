# AGENTS.md

## Purpose

这份文件是 VerseCraft 仓库内长期有效的 Codex 上下文入口。目标不是复述一次性任务需求，而是让后续代理在进入仓库时，先对齐同一套产品定位、接口契约、架构方向与改码边界，再开始动手。

如果这里的描述与代码冲突，以当前仓库真实代码为准，并应优先更新本文件，而不是让同类背景知识继续散落在聊天记录里。

---

## 1. 仓库定位

### 1.1 VerseCraft 是什么

VerseCraft（文界工坊）是一个**单机、浏览器内运行、AI 驱动的中文互动叙事游戏平台原型**。它不是把小说塞进聊天框，而是把世界规则、角色状态、玩家行动、后果推进交给 AI 作为“故事运行时”来处理。

### 1.2 当前主世界 / 主玩法

- 当前主可玩世界是 **「序章·暗月」**。
- 当前主玩法是：**玩家用自然语言输入行动，服务端经 `/api/chat` 生成结构化 DM 回合结果，客户端再把这些结果落到日志、任务、图鉴、道具、位置、时间与危险推进上。**
- 这是一个以悬疑 / 恐怖 / 公寓异变 / 校源谜团为主的中文叙事样板世界，不是 VerseCraft 最终题材边界。
- 当前玩法已明显依赖这些系统共同工作：
  - SSE 流式回合输出
  - 结构化 DM JSON 契约
  - 客户端统一游戏状态仓库
  - 世界知识检索与 lore 注入
  - NPC 认知边界与一致性校验
  - 后台 world engine tick

### 1.3 当前产品状态

- 仓库是**可游玩原型**，不是纯文档仓库。
- 所有 UI 文案默认应保持**简体中文**。
- 目标是把“单个示例世界”逐步抽象成“可持续孵化多个世界的互动叙事基础设施”。

---

## 2. 当前技术栈与运行方式

### 2.1 技术栈

- **Next.js 16**（App Router）
- **React 19**
- **Node.js >=22.22.0**
- **Tailwind CSS v4**
- **Zustand 5**
- **PostgreSQL + Drizzle**
- **IndexedDB (`idb-keyval`)**：客户端游戏态持久化
- **one-api / OpenAI-compatible gateway**：统一 AI 网关

### 2.2 运行事实

- 包管理器固定为 **`pnpm@10`**；锁文件是 `pnpm-lock.yaml`
- 本地 Node.js 基线为 **`>=22.22.0`**；Browser Use / node_repl 也必须解析到同一基线
- 本地开发默认端口是 **`666`**：`pnpm dev`
- 生产 / Docker 默认端口仍是 **`3000`**
- AI 统一经 `src/lib/ai/*` 发往一个 gateway，不在业务代码里散落模型厂商字符串
- 服务端数据与 analytics 在 PostgreSQL；客户端游玩态仍然是 client-first

### 2.3 环境变量与配置读取

- 服务端环境变量单一入口：
  - `src/lib/config/serverConfig.ts`
  - `src/lib/config/envRaw.ts`
- AI 环境入口：
  - `src/lib/ai/config/env.ts`
  - `src/lib/ai/config/envCore.ts`
- 浏览器可见环境入口：
  - `src/lib/config/publicRuntime.ts`
- `src/` 内除配置层与 Next.js 约定外，**不要直接读 `process.env`**

### 2.4 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm test:unit`
- `pnpm test:e2e:chat`
- `pnpm test:e2e:contract`
- `pnpm test:ci`
- `pnpm verify:ai-gateway`
- `pnpm probe:ai-gateway`
- `pnpm worker:kg`
- `pnpm worker:kg:once`
- `pnpm run ship -- "feat: 说明"`
- `npx eslint .`

### 2.5 已知运行 caveats

- **不要依赖 `pnpm lint` / `next lint`**；Next.js 16 下实际请用 `npx eslint .`
- `pnpm dev` 默认跑在 `666`；某些无特权 Linux 环境要改用 `3000`
- Codex Browser Use 依赖 `NODE_REPL_NODE_PATH` 或 PATH 中可解析的合格 Node；低于 `22.22.0` 会导致 node_repl bootstrap 失败。Windows 本机优先将 `NODE_REPL_NODE_PATH` 指向 `D:\node-v22.22.2\node.exe` 或其他 `>=22.22.0` 的可执行文件；如果调整用户环境变量后 Browser Use 仍解析到旧的 `D:\node\node.exe`，需要重启 Codex app 让 MCP 进程继承新环境
- `pnpm test:unit` 已知可能因 Redis open handle 不主动退出，结果通过不代表进程会自己结束
- `deploy.sh` 是 Node 脚本；发布请用 `pnpm run ship -- "msg"`，不要手动 `bash ./deploy.sh`

---

## 3. 不可破坏契约

这些不是“建议”，而是后续任务必须默认遵守的兼容边界。

### 3.1 不更换技术栈

- 不把 Next.js / React / Tailwind / Zustand / Drizzle / PostgreSQL 替换成别的主干方案
- 不把 `/api/chat` 从当前 SSE 路径随意改成别的传输协议
- 不把客户端统一 store 再拆回双 store 或多套平行真相源
- 不把 AI 网关调用重新散落到业务模块里

### 3.2 `/api/chat` 的 SSE / JSON 契约

当前真实契约来自 `src/app/api/chat/route.ts`、`src/lib/playRealtime/normalizePlayerDmJson.ts`、`e2e/chat-sse-contract.spec.ts`：

- `/api/chat` 返回值类型是 **`text/event-stream; charset=utf-8`**
- 未配置网关时，接口仍返回 **`200` + SSE**，并带 `X-VerseCraft-Ai-Status: keys_missing`
- 流中允许出现控制帧：
  - `__VERSECRAFT_STATUS__:{...}`
- 最终权威结果可通过终帧输出：
  - `__VERSECRAFT_FINAL__:<json>`
- 客户端与 E2E 都按“累积 data chunk，若出现 `__VERSECRAFT_FINAL__` 则以它覆盖之前正文”的规则解析
- 最低必需 DM JSON 四键是：
  - `is_action_legal`
  - `sanity_damage`
  - `narrative`
  - `is_death`
- 服务端会统一补齐 / 规范化默认字段，例如：
  - `consumes_time`
  - `options`
  - `currency_change`
  - `new_tasks`
  - `task_updates`
  - `codex_updates`
  - `relationship_updates`
  - `awarded_items`
  - `awarded_warehouse_items`
  - `player_location`
  - `npc_location_updates`
  - `bgm_track`
- **不要绕过最终收口链路直接把原始模型 JSON 透传给前端**
- 当前最终收口顺序是架构事实：
  - `parseAccumulatedPlayerDmJson`
  - `normalizePlayerDmJson`
  - `applyDmChangeSetToDmRecord`
  - 多层 server guard / task normalization / enhancement
  - `applyNpcConsistencyPostGeneration`
  - `resolveDmTurn`
  - `__VERSECRAFT_FINAL__`

### 3.3 数据库与 analytics 兼容性

`src/db/schema.ts` 显示仓库已经把 analytics 与 world engine 作为正式 schema 的一部分，而不是临时表：

- `analytics_events` 是 append-only 事件基础表，依赖 `idempotencyKey`
- `actor_sessions` / `actor_daily_activity` / `actor_daily_tokens` / `admin_metrics_daily` 已构成统计口径
- 旧 `users` 累积字段仍保留做兼容，不应轻易删掉
- `game_session_memory` 仍是 session 压缩记忆与相关写回的重要表
- `world_engine_runs`
- `world_engine_event_queue`
- `world_engine_agenda_snapshots`

因此：

- 不要随意改表名、删字段、改事件名、改关键 payload 键
- 尤其不要轻率破坏这些事件与兼容口径：
  - `chat_request_finished`
  - `world_engine_enqueued`
- 如果任务明确要求改 schema，必须同时说明：
  - 兼容旧数据的方式
  - analytics / admin 面是否受影响
  - 是否需要迁移、回填或双写期

### 3.4 AI 路由与 prompt 契约

- 业务代码优先使用 `@/lib/ai/logicalTasks` 或 `@/lib/ai/service`
- 不要在功能代码里直接写模型厂商 ID
- `PLAYER_CHAT` 主链路禁止走 `reasoner` / `enhance`
- `reasoner` 主要用于离线任务与后台 worker，不进入在线主叙事流
- 上行多轮消息在发给 gateway 前，必须去掉 `reasoning_content`
- 任何要求结构化 JSON 的 system prompt，必须包含字面量：
  - **`请严格以 JSON 格式输出`**

### 3.5 前端与状态红线

- `src/store/useGameStore.ts` 是**唯一主游戏 store**
- Zustand `persist` 必须保留 `skipHydration: true`
- 客户端 hydration 应通过显式 `rehydrate()` + `isHydrated` 保护完成
- 开场流程必须保持**单主链**，不能让本地 fallback 与真实 SSE 主流互相竞争写入
- 注册成功默认应建立服务端 session，而不是补一个前端“自动登录 workaround”

### 3.6 Next.js 16 约束

- App Router 的 `params` / `searchParams` / `cookies()` / `headers()` 都按异步接口处理
- 不要写同步访问的旧时代代码

---

## 4. 新的执行架构方向

下面这些词是**未来改造方向标签**。它们不要求今天已经存在同名目录，但后续设计和重构应该朝这些方向收敛，并尽量复用现有实现落点，而不是另起一套平行体系。

### 4.1 `workflow over agent`

VerseCraft 当前在线回合已经是一个**确定性工作流**，而不是自由发挥的多 agent 剧本：

- 输入校验
- 安全检查
- 风险分 lane
- control preflight
- lore / runtime packet 组装
- 主模型流式输出
- final hooks
- validator
- turn resolve
- world tick enqueue

后续应继续强化这种“**明确阶段 + 明确输入输出 + 明确 fallback**”的 workflow，而不是把主链路改成难以验证的 agent 协商系统。

### 4.2 `turn compiler`

`/api/chat` 未来应越来越像一个**回合编译器**：

- 模型先给候选 DM JSON
- 服务端再做变更集折叠、结构规范化、守卫、validator、turn mode 校正、最终 envelope 解析
- 以 `resolveDmTurn` 产物作为权威提交对象

也就是说：**模型输出只是候选，中间层和收口层才是最终裁决。**

### 4.3 `lane routing`

当前仓库已经真实落地了 `fast` / `slow` lane：

- `src/lib/security/chatRiskLane.ts`
- `/api/chat` 中的 preflight / runtime packets / lore / TTFT 预算控制

后续新增昂贵逻辑时，优先问自己：

- 这必须阻塞首包吗？
- 它只该进 slow lane 吗？
- 它能放到 final hooks 或后台吗？

**不要把所有新逻辑直接堆进首字前路径。**

### 4.4 `state delta first, narrative second`

当前仓库方向应明确为：

- 结构化字段是权威状态变化
- narrative 是叙事呈现，不是客户端状态真相源

落地含义：

- 客户端不要通过解析 narrative 来脑补状态
- 新功能优先新增或复用结构化 delta，再决定 narrative 如何表达
- `dm_change_set`、`resolveDmTurn`、任务 / 线索 / 道具 / 地点 / threat 更新都属于这条原则的现有落点

### 4.5 `epistemic filtering`

NPC 认知边界不是风格要求，而是架构要求。

当前代码与文档已明确两层事实：

- prompt 前要做 actor-scoped / reveal-rank / profile-based 过滤
- prompt 后还要做 post-generation consistency / epistemic validator

后续任何 lore、memory、NPC 发言相关改动，都要默认经过：

- `src/lib/epistemic/*`
- `src/lib/npcConsistency/*`

而不是把更多全局摘要塞进 prompt 指望模型自觉。

### 4.6 `post-generation validation`

VerseCraft 现状不是“prompt 一把梭”，而是“**生成后仍要校验**”。

已存在的方向包括：

- `applyNpcConsistencyPostGeneration`
- narrative protocol guard
- POV / gender / continuity / foreshadow / task-mode / time-feel 等 validator

后续如果出现一致性问题，优先考虑：

- 更窄的 validator
- 更明确的 telemetry
- 更保守的 rewrite / degrade

而不是只继续加长 system prompt。

### 4.7 `background world tick`

后台世界推进已经有真实落点，不是概念图：

- 在线回合末尾只做 `enqueueWorldEngineTick`
- worker 由 `scripts/vc-worker.ts` 消费 `WORLD_ENGINE_TICK`
- 持久化落到：
  - `world_engine_runs`
  - `world_engine_event_queue`
  - `world_engine_agenda_snapshots`

所以未来方向是：

- **在线回合只负责当前回合裁决**
- **世界后续演化交给后台 tick**
- 不要把离线 reasoner 重新塞回 `/api/chat` 首包路径

---

## 5. 代码修改原则

### 5.1 先抽离大文件，再加行为

如果改动目标位于这些“超大枢纽文件”，优先先做拆分，再做新功能：

- `src/app/api/chat/route.ts`
- `src/app/play/page.tsx`
- `src/store/useGameStore.ts`
- `src/lib/playRealtime/playerChatSystemPrompt.ts`

不要在已经很重的文件上继续直接叠加数百行逻辑。

### 5.2 小步提交

- 一次只做一个清晰、可验证的目标
- 一次 PR / 一次 Codex 回合尽量只跨一个主问题
- 能拆成“重构准备”和“行为变化”两步时，优先拆开

### 5.3 每次只做一个可验证目标

可验证目标示例：

- 不改变行为，只提取模块并补测试
- 修复某个明确 contract bug
- 给某个 validator 增加一类规则和对应测试
- 给某个 lane 增加预算守卫和 telemetry

避免“顺手把架构全重写”。

### 5.4 能写测试就写测试

优先补的测试类型：

- unit：纯函数、parser、validator、routing、turn resolve
- contract：`/api/chat` SSE / DM JSON 形状
- integration：world tick、knowledge writeback、epistemic filtering

如果不写测试，至少说明为什么当前改动难以自动验证。

### 5.5 不了解代码路径前，不要直接大改

- 先确认输入从哪里来
- 再确认谁消费输出
- 再确认是否有 E2E / analytics / admin 口径依赖
- 最后才动代码

在 VerseCraft，这一点尤其适用于：

- `/api/chat`
- `useGameStore`
- `page.tsx`
- `schema.ts`
- `analytics`

### 5.6 Prompt 改动要克制

- Prompt 不是无成本配置文件，而是全局行为面
- 修改 `playerChatSystemPrompt.ts` 前先判断能否用 packet、guard、validator、typed delta 解决
- 如果确实修改 stable prompt 语义边界，考虑同步处理 `VERSECRAFT_DM_STABLE_PROMPT_VERSION`

### 5.7 配置优先于散改业务

- 切模型优先改 one-api 或 `AI_MODEL_*`
- 切任务角色优先改 `taskPolicy`
- 改环境解析优先改 config 层

不要把同一类策略散落进多个 feature 文件。

---

## 6. 文件级建议

### 6.1 后续大概率会成为核心改造点

- `src/app/api/chat/route.ts`
  - 在线回合主工作流、SSE、final hooks、analytics、world tick enqueue
- `src/lib/playRealtime/playerChatSystemPrompt.ts`
  - Stable / dynamic prompt 边界、运行时 packet 拼装
- `src/features/play/turnCommit/resolveDmTurn.ts`
  - 最终 turn envelope 收口
- `src/lib/dmChangeSet/*`
  - 候选变更集折叠、state-delta 化
- `src/lib/security/chatRiskLane.ts`
  - lane routing 入口
- `src/lib/ai/tasks/taskPolicy.ts`
  - task -> role / budget / stream / forbidden 路由矩阵
- `src/lib/worldKnowledge/runtime/getRuntimeLore.ts`
  - 运行时 lore 检索入口
- `src/lib/epistemic/*`
  - actor-scoped knowledge、reveal gating、认知过滤
- `src/lib/npcConsistency/*`
  - post-generation validators
- `src/lib/turnEngine/*`
  - **Phase-2/4/5 新增的结构化执行主干**：
    - `normalizePlayerInput.ts` / `routeTurnLane.ts` / `computeStateDelta.ts`
    - `epistemic/filterFacts.ts` / `epistemic/buildEpistemicInput.ts` —— 认知分桶
    - `validateNarrative.ts` —— Phase-8.5 post-generation validator（11 条规则）
    - `commitTurn.ts` —— Phase-8.5 显式提交 + `TurnCommitSummary`
    - `enqueueBackgroundTick.ts` —— Phase-9 非阻塞后台 world tick
    - `sse.ts` —— SSE 帧工具
  - 详见 `docs/turn-engine-architecture.md`
- `src/lib/worldEngine/*`
  - 后台世界推进
- `scripts/vc-worker.ts`
  - 后台 job / world tick worker

### 6.2 只允许谨慎修改的文件 / 区域

- `src/db/schema.ts`
  - 任何改动都可能影响 migration、analytics、admin、worker、历史数据兼容
- `src/app/api/chat/route.ts`
  - 它是核心改造点，但也是最高风险文件；每次改动都要先想 contract 与 TTFT
- `src/app/play/page.tsx`
  - 客户端 SSE 解析、状态应用、日志与 turn 提交都在这里收口
- `src/store/useGameStore.ts`
  - 单一 store、hydration、客户端真相源，极易产生连锁回归
- `src/lib/analytics/*`
  - 管理端与事件统计都依赖现有口径
- `src/lib/playRealtime/playerChatSystemPrompt.ts`
  - 每一次 prompt 边界变化都会影响全部回合行为

### 6.3 关于 registry / knowledge / DB 的边界

- `src/lib/registry/*` 现在更适合作为 **bootstrap seed / fallback / 展示常量**
- 运行时事实源应继续向 **DB + retrieval + packet** 收敛
- 不要把更多“完整世界事实”重新硬塞回前端静态 TS

### 6.4 Mobile Reading UI / Play Shell 改造约定

`/play` 的主视觉入口是移动端优先的阅读 / 游玩壳层，不是桌面后台页。后续改视觉与交互时，先从这些文件进入：

- `src/app/play/page.tsx`
  - 仍是 `/play` 全栈接线点：SSE、回合提交、状态写入、菜单状态、音频与天赋效果都在这里收口。
  - 这里只应做必要接线，不要继续堆大段视觉 JSX。
- `src/features/play/mobileReading/*`
  - 移动端阅读壳层主目录。
  - `MobileReadingShell`：`100dvh` 阅读表面与根测试选择器。
  - `MobileReadingHeader`：品牌、章节名、声音按钮。
  - `MobileStoryViewport`：正文滚动区域外壳，正文仍由 `PlayStoryScroll` / narrative renderer 负责。
  - `MobileActionDock`：底部输入胶囊、选项展开按钮、发送按钮。
  - `MobileCharacterPanel`：底部“角色”页的移动端身份信息、原石余额和属性加点面板。
  - `MobileCodexPanel`：底部“图鉴”页的 B1 人物卡片、识别计数、剪影占位和详情面板。
  - `EchoTalentButton`：天赋按钮的纯 UI 入口。
  - `MobileOptionsDropdown`：四条行动选项的移动端下拉展示。
  - `MobileBottomNav`：角色 / 剧情 / 图鉴 / 设置底部导航。
  - `theme.ts`、`icons.tsx`、`types.ts`、`hooks/useMobileActionDock.ts` 分别放视觉 token、图标选择、props 类型和输入栏局部 UI 状态。

输入、选项、天赋、底部导航和菜单打开的责任边界：

- 手动输入值仍来自 `useGameStore` / `src/app/play/page.tsx` 的 `input`、`setInput`、`onSubmit` 接线。
- 行动选项仍来自 `currentOptions`，选择后走 `onPickOption`，不得绕过既有 `sendAction`、职业认证、终局选项和 guest gate。
- 选项按钮只切换 `optionsExpanded`；缺选项时仍由 `requestFreshOptions("manual_button")` 触发既有 options regen 链路。
- 天赋按钮只触发 `onUseTalent`；`onUseTalent` 仍留在 `page.tsx`，不要把天赋业务效果塞进 UI 图标组件。
- 底部“角色”通过 `setActiveMenu("character")` 打开 `MobileCharacterPanel`，仍在移动阅读壳层内，不新增路由、不进入 `UnifiedMenuModal`。属性加点只调用现有 `upgradeAttribute`，不要新建第二套加点规则。
- 底部“剧情”只收起选项并回到阅读态。
- 底部“图鉴”通过 `setActiveMenu("codex")` 打开 `MobileCodexPanel`，仍在移动阅读壳层内，不新增路由、不进入 `UnifiedMenuModal`；图鉴展示 helper 位于 `codexCatalog.ts`、`codexPortraits.ts`、`codexFormat.ts`。
- 底部“设置”通过 `setActiveMenu("settings")` 打开现有 `UnifiedMenuModal`；`UnifiedMenuModal` 当前只保留设置可见入口。

仍然禁止重新暴露这些主动 UI 入口：

- 任务栏
- 游戏指南
- 灵感手记
- 仓库
- 成就
- 武器

移动端阅读壳层改动必须保留这些稳定测试选择器，并更新对应浏览器验证：

- `mobile-reading-shell`
- `mobile-reading-header`
- `mobile-story-viewport`
- `mobile-action-dock`
- `echo-talent-button`
- `manual-action-input`
- `options-toggle-button`
- `send-action-button`
- `mobile-options-dropdown`
- `mobile-option-item`
- `mobile-bottom-nav`
- `mobile-codex-panel`
- `bottom-nav-character`
- `bottom-nav-story`
- `bottom-nav-codex`
- `bottom-nav-settings`

该区域改动的最低验证要求：

- `npx eslint .`
- 相关 `/play` 或 mobile reading E2E，至少覆盖 `390×844`、`393×852`、`430×932`
- 能使用 Browser Use 时，必须用 in-app browser 做移动端截图 / DOM 验证；若本机插件运行环境不可用，必须记录阻塞原因并用 Playwright 浏览器验证兜底。

---

## 7. Prompt 与任务模式约定

### 7.1 Ask 模式

后续 Codex 任务如果明确写了 **“Ask 模式”**，默认行为是：

- 先给计划
- 说明会改哪些文件
- 说明风险与验证方式
- **不直接写代码**

### 7.2 Code 模式

后续 Codex 任务如果明确写了 **“Code 模式”**，默认行为是：

- 按最小可验证路径直接实施
- 回报改动文件
- 回报风险
- 回报测试结果或未测原因

### 7.3 未显式说明模式时

- 如果用户显式要求“先讨论 / 先评审 / 先给方案”，按 Ask 处理
- 否则默认按 Code 处理，但仍应先理解代码路径，再动手

---

## 8. 给未来 Codex 的八条最重要约束

1. **不要破坏 `/api/chat` 的 SSE 契约。** 维持 `event-stream`、`keys_missing` 降级、status 帧、`__VERSECRAFT_FINAL__` 终帧覆盖规则。
2. **不要把 narrative 当成状态真相源。** 结构化 delta、guard 与 `resolveDmTurn` 才是权威。
3. **不要把在线主链路改成 agent 协商系统。** 继续做可验证的 staged workflow。
4. **不要让 `reasoner` 回到 `PLAYER_CHAT` 主流。** 离线推演与 world tick 走后台。
5. **不要破坏 analytics 与现有 schema 兼容。** 事件名、payload 键、表结构变更必须有兼容计划。
6. **不要绕过 epistemic filtering 和 post-generation validation。** NPC 一致性不能只靠 prompt 自觉。
7. **不要重新拆散统一 store 或破坏 hydration 约定。**
8. **不要在没看清调用链前直接大改大文件。** 先抽离，再加行为，再验证。

---

## 8.5 Turn Engine 入口（Phase 2–5 新增）

> 详见：`docs/turn-engine-architecture.md`

**结构化主干**：

- `src/lib/turnEngine/types.ts` —— `TurnLane`、`NormalizedPlayerIntent`、`StateDelta`、`TurnExecutionContext` 等全部核心类型
- `src/lib/turnEngine/normalizePlayerInput.ts` —— raw input → 结构化意图
- `src/lib/turnEngine/routeTurnLane.ts` —— intent + risk → `TurnLaneDecision`
- `src/lib/turnEngine/computeStateDelta.ts` —— pre / post-narrative delta 合成

**认知过滤**：

- `src/lib/turnEngine/epistemic/filterFacts.ts` —— 5 桶分类（dmOnly / scenePublic / playerOnly / actorScoped / residue）
- `src/lib/turnEngine/epistemic/buildEpistemicInput.ts` —— 事实源汇聚

**Post-generation validator（Phase 8.5）**：

- `src/lib/turnEngine/validateNarrative.ts` —— 11 条规则，包含 DM-only leak、location conflict、reveal tier、options affordance、inventory/time/task 一致性、npcConsistency bridge
- `src/lib/turnEngine/commitTurn.ts` —— 显式 `commitTurn` + `TurnCommitSummary`（deltaSummary / commitFlags / validatorIssueCounts）

**后台推进（Phase 9）**：

- `src/lib/turnEngine/enqueueBackgroundTick.ts` —— 同步 `decideBackgroundTick` + 非阻塞 `scheduleBackgroundWorldTick`
- `src/lib/worldEngine/queue.ts` —— 实际入队
- `scripts/vc-worker.ts` —— 消费 worker

**Analytics 事件（已正式化）**：

- `turn_lane_decided` / `turn_commit_summary` / `narrative_validator_issue` / `world_engine_enqueued`

**关键测试**：

- `src/lib/turnEngine/*.test.ts` —— 单元与 smoke（含 TTFT < 50ms p95）
- `src/lib/turnEngine/sse.test.ts` —— SSE envelope 契约（status 过滤 / final 覆盖 / 大尺寸 round-trip）
- `src/lib/playRealtime/chatRouteContract.test.ts` —— route.ts 关键字段静态快照
- `src/app/api/chat/controlPreflightBudget.contract.test.ts` —— control preflight 预算契约

---

## 9. 仓库内仍然有效的老红线

这些内容来自旧版 `AGENTS.md`，在当前仓库中仍然成立，应继续保留：

- Next.js 16 App Router 异步 request API 规则
- Zustand `skipHydration: true` + 手动 rehydrate
- `useGameStore` 作为唯一主 store
- opening 只保留一个主请求链
- 注册成功直接建立服务端 session
- 上行消息必须剥离 `reasoning_content`
- JSON prompt 必须包含 `请严格以 JSON 格式输出`

---

## 10. `/play` 章节系统入口

章节功能是 `/play` 移动阅读壳层内的状态层，不是新路由、小说目录或关卡大厅。

- 纯逻辑入口在 `src/lib/chapters/*`：章节定义、进度计算、完成判断、章末总结、旧存档迁移都应在这里维护。
- UI 入口在 `src/features/play/chapters/*`：`ChapterHeaderPill`、`ChapterNavigator`、`ChapterEndSheet`、`ChapterSummaryList` 只负责移动端呈现和调用 store action。
- `src/app/play/page.tsx` 只负责在结构化回合提交完成后，把 `/api/chat` 已规范化的 DM JSON 与 store 前后状态信号传给 `recordChapterTurn`。
- 章节推进不得要求 AI 新增必填字段；v1 默认不修改 `/api/chat` SSE / JSON 契约。
- 不要通过解析 narrative 推进章节。可用信号包括有效回合数、选项/手输来源、位置变化、任务/图鉴/线索/关系/道具/理智/风险等结构化变化。
- 章节状态进入 `useGameStore.chapterState`、存档槽与 `RunSnapshotV2.chapterState`；旧存档缺省迁移为第一章 active。
- 回顾上一章是安全只读回顾，不回滚存档，不清空当前章节进度。
- 章节导航不得重新暴露任务栏、游戏指南、灵感手记、仓库、成就、武器等已裁剪主动入口。
- 修改章节区域后必须做移动端浏览器验证，至少覆盖 390×844、393×852、430×932。

---

## 11. 最后提醒

VerseCraft 不是普通聊天应用，也不是只有 prompt 的 demo。它现在已经是一个带有：

- 在线 SSE 回合引擎
- 结构化状态提交
- analytics 兼容层
- epistemic filtering
- post-generation validators
- background world tick

的叙事系统原型。

后续任务最容易犯的错误，不是“代码写不出来”，而是**忽略了这些系统之间已经存在的契约**。进入任务前，先确认自己改的是哪一层；动手时，尽量只改那一层。
