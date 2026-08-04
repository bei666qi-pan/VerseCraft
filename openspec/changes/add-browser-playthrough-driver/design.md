## Context

VerseCraft 已有两类互补测试：`src/lib/evals/playthrough` 用 `HttpSutAdapter` 直接调用真实 `/api/chat`，而 `e2e/play-live-turn.spec.ts` 用真实浏览器覆盖一回合。前者不覆盖客户端 hydration、创建页、可见等待体验和 IndexedDB；后者通过预灌存档起步，无法验证新玩家路径。

本变更新增一个仅用于 Playwright 的浏览器 driver。它必须保持 `/api/chat`、SSE、Zustand store、analytics 和世界推进的既有生产路径不变，并且只在 `E2E_AI_LIVE=1` 的 opt-in 测试中调用真网关。

## Goals / Non-Goals

**Goals:**

- 以真实 UI 完成 `/intro → /create → /play` 本地角色创建和至少多回合行动。
- 让行动决策可替换：保留固定动作序列，并提供 Codex 可实际使用的文件握手决策器。
- 在每回合保存玩家可见观测、权威终帧、动作和截图路径，使失败无需重新依赖模型选择即可复跑。
- 验证移动视口下的回合提交、等待恢复、SSE final、刷新续玩和无页面异常。

**Non-Goals:**

- 不把 Codex 或任一第二玩家 LLM API 调用嵌入脚本、CI 或产品服务。
- 不从 driver 读取 `useGameStore`、API 内部 packet 或 prompt 来决定动作。
- 不覆盖账号注册、云存档或所有结局；账号注册另由既有 home auth E2E 覆盖。
- 不修改 `/api/chat` 运行时、SSE 解析、状态提交、schema、analytics 或 world worker。

## Decisions

### 1. 以复用的 Playwright helper 作为唯一浏览器入口

新增 `e2e/support/browserPlaythrough.ts`，公开 `startLocalBrowserPlaythrough`、`runBrowserPlaythrough` 与 `BrowserPlaythroughDecisionProvider`。driver 用 testid 和可见文本完成 intro/create/play 操作，不预写 IndexedDB、不 route/mock `/api/chat`。

备选方案是扩展 `HttpSutAdapter`。该方案会继续绕过 hydration、视觉等待与真正的输入提交，不能满足目标，故不采用。

### 2. 决策与浏览器执行分离

`BrowserPlaythroughDecisionProvider` 接收仅由 UI 收集的观测（最近可见叙事、当前选项、输入是否可用、回合号），返回自然语言 `action`、短 `intent` 与可选 `stop`。首版 `sequenceDecisionProvider` 使真实网关测试可复现且不额外消耗模型配额。

Codex 主导的游玩通过一个文件握手调度器读取同一 observation 并返回相同结构；driver 不承担“调用 Codex”的耦合责任。这避免 CI 绑定交互式 agent 生命周期，也保证 DM/导演仍是唯一游戏 API 模型调用。

### 3. 使用每回合独立 ticket 的原子文件握手

`createCodexFileHandoff` 在 run 专属目录创建 `request.json` 和 `decision.json` 的约定。每回合 driver 先删除上次 decision、原子写入 request，再轮询与当前 `protocolVersion`、`runId`、`turnIndex`、`ticket` 全部匹配的 decision。request 仅包含玩家可见 observation 与运行说明；decision 只包含自然语言 action、短 intent 和 stop。

协议包含 `developer` 与 `blind` 模式。开发者模式由当前项目 Codex 阅读 request 并可结合仓库主动执行异常/边界探索；盲测模式的父测试器为每局创建一个 projectless Codex task，并只将该局 request 的 observation 字段复制给它。盲测 task 不接收项目、request 文件路径、SSE final、trace、store 或调试信息；它的任务历史只含本局先前的玩家可见 observation。父测试器仅接受其结构化 action/intent/stop 结果并调用本地 CLI 代写 decision。

提交 CLI 读取 request、验证必填字段并原子写入匹配的 decision。由于 ticket 在每回合变化，残留/并发写入不能被当作当前行动。超时或不合法 decision 终止本局并写入 trace。

备选方案是让测试直接调用 Codex API。它会把玩家脑变成第二个模型 API、引入凭证/成本/CI 生命周期耦合，不符合目标，故不采用。备选方案是无 ticket 的固定文件；它会把旧回合动作误提交到新场景，故不采用。

### 4. 每回合以网络响应和可见页面双重取证

提交前注册 `/api/chat` response wait；响应必须为 `200 + text/event-stream` 并包含可解析 `__VERSECRAFT_FINAL__`。随后等待输入恢复与叙事显示。记录的 trace 同时包含最终 JSON、动作、可见观测与截图文件名。

备选方案是只断言 DOM。它无法区分无终帧、终帧未提交与前端渲染错误，故不采用。备选方案是只保留网络输出；它无法发现 UI 卡死，故不采用。

### 5. 用有限回合和实际终止原因代替“必须通关”

driver 接受 `maxTurns`，每局因决策停止、死亡/结局 UI、网关失败或耗尽预算结束。首版真网关测试使用两步自然语言输入，覆盖连续状态与续玩；不以抵达特定剧情结局作为通过前提。

### 6. 证据落在被忽略的 runtime data

默认输出为 `.runtime-data/browser-playthrough/<run-id>.json`，截图存同目录。运行失败时 driver 仍尽力落盘 trace。文件记录的是测试角色和玩家可见/服务端 final 数据，不记录凭据、prompt 或完整浏览器存储。

## Risks / Trade-offs

- [真实 gateway 的输出存在波动和成本] → 保持 `E2E_AI_LIVE=1` opt-in、两回合默认预算、固定动作、120 秒测试上限；普通 CI 不执行。
- [UI 文案或选择器演进导致 driver 易碎] → 优先现有 `data-testid`，并把 helper 的行为用 mock/local E2E 覆盖。
- [模型/网关短暂降级被误判为产品 bug] → trace 保存 `aiStatus` 和 response body；测试清楚报告降级帧，后续由同一动作序列复跑确认。
- [直接读取 store 会让“玩家思考”失真] → 决策输入限定为 DOM 可见状态；store 只由页面正常写入。
- [旧 decision 被新回合误用] → 每回合 request/decision 带随机 ticket，且 driver 只接受 run、turn、协议版本和 ticket 均匹配的原子文件。
- [Codex 未响应导致浏览器永远等待] → handoff provider 使用显式超时，写入失败 trace 并让 Playwright 失败；手动 playtest 不进入常规 CI。
- [盲测 agent 因共享项目而泄漏工程知识] → 每局创建 projectless 新 task，prompt 只内嵌该局 observation JSON，且父测试器不转发仓库路径、trace 或 API/状态数据。
- [长局无法自然到达结局] → 明确预算终止是合法 playtest 结果，长期通过多个 persona/批次提高覆盖，而非把单局当通关脚本。

## Migration Plan

1. 添加纯测试辅助和 opt-in E2E，不影响生产 bundle。
2. 在本地用 mock gateway 验证创建、trace 结构、文件握手和决策提交 CLI；有可用密钥时以 `E2E_AI_LIVE=1 E2E_CODEX_PLAYTEST=1` 启动外部 Codex playtest。
3. 若 handoff 或 live driver 造成不稳定，可在不改任何生产代码的情况下移除其手动测试入口，保留既有 API playthrough；删除 helper/CLI 即可完全回滚。

## Open Questions

- 注册账号与云存档的真实长程游玩需独立测试数据库和清理策略，不纳入本地角色档首版。
