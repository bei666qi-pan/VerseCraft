## Why

现有长程 playthrough harness 能真实调用 `/api/chat`，但绕过了角色创建、浏览器持久化与移动端游玩界面；现有真实网关 Playwright 用例又只覆盖一回合且从预灌存档起步。需要一条可复用的浏览器游玩链路，才能用真实玩家可见状态发现创建后无法继续、回合未提交、等待体验中断及存档续玩等问题，并产出可复跑的证据。

## What Changes

- 新增可复用的 Playwright 浏览器 playthrough driver：从 `/intro → /create → /play` 创建本地角色档，使用真实可见输入完成多回合游玩，并采集回合证据。
- 新增可插拔的行动决策接口与确定性决策实现；driver 不调用第二个玩家 LLM。
- 将 Codex 外部决策者落地为文件握手：driver 每回合写出仅玩家可见的 observation request，等待同一 run/turn/ticket 的 Codex decision 文件，再通过真实 UI 提交该动作。
- 支持两种 Codex 决策模式：开发者模式允许当前 Codex 结合仓库主动探测边界；盲测玩家模式由父测试器每局创建无项目上下文的新 Codex task，只转交本局的 observation JSON 并代写其决定。
- 新增决策提交 CLI 与 opt-in Codex handoff E2E，支持一个 Codex 会话在不接触 store、prompt 或 API 内部 packet 的前提下连续游玩。
- 新增 opt-in 真网关浏览器 E2E：验证创建后的多回合提交、SSE 权威终帧、可继续输入、无页面异常，以及刷新后的本地存档续玩。
- 将每局可复跑的动作、玩家可见观测、SSE 终帧、截图路径和失败信息写入 `.runtime-data/browser-playthrough/`，不进入 Git。

非目标：不改变 `/api/chat`、SSE/DM JSON、prompt、状态提交、账号注册或后台 world tick；不把 Codex 服务或任一玩家模型 API 调用嵌入 CI；不保证每局必须抵达特定结局。

## Capabilities

### New Capabilities

- `browser-playthrough-driver`: 从真实创建流程起步、以玩家可见界面完成多回合游玩的可复用浏览器测试驱动与证据产出。

### Modified Capabilities

- 无。

## Impact

- 新增 `e2e/support` 下的测试辅助代码、决策提交 CLI 和 opt-in 真实网关 Playwright 用例，复用现有 `E2E_AI_LIVE=1` 开关与 Playwright 配置。
- 新增 `.runtime-data` 运行证据，不改数据库 schema、analytics 事件、生产 API 或持久化格式。
- 浏览器 E2E 会走真实 `/api/chat`，因此仅在显式启用时消耗 AI gateway 配额；不会增加首包、TTFT 或在线回合运行时开销。网关不可用时沿用现有 `E2E_AI_LIVE` skip 行为，常规 CI 不运行该用例。
