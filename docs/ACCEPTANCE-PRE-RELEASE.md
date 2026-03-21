# 上线前验收报告 — 多模型重构（VerseCraft）

**日期**：2026-03-21（文档随仓库迭代）  
**范围**：`src/lib/ai/*`、配置层、内容安全、CI/E2E、文档与 `pnpm test:unit`。

## 结论总表

| 验收项 | 状态 | 说明 |
|--------|------|------|
| 彻底移除火山引擎（Volcengine）专用代码与审核分支 | **已完成** | 全仓库 `volcengine`/`VOLCENGINE` 字符串检索为 0；`moderation.ts` 不再分支 `volcengine`。 |
| 仅保留 4 个指定逻辑模型 | **已完成** | `models/registry.ts` 中 `ALLOWED_MODEL_IDS` 长度恒为 4；单测 `registry.test.ts` 断言。 |
| 默认优先 DeepSeek-V3.2（玩家主叙事） | **已完成** | `TASK_POLICY.PLAYER_CHAT.primaryModel === "deepseek-v3.2"`；`taskPolicy.test.ts`。 |
| `deepseek-reasoner` 不进入在线主链路（PLAYER_CHAT 等） | **已完成** | `TASK_MODEL_FORBIDDEN` 禁止 reasoner 参与 `PLAYER_CHAT` / 控制面 / 意图 / 安全预筛等；单测覆盖。 |
| MiniMax 仅用于少数高价值增强 | **已完成** | 任务绑定仅为 `SCENE_ENHANCEMENT` / `NPC_EMOTION_POLISH`；禁止表排除主链路；门控在 `enhancementRulesPure.ts` + 预算（见 `ai-governance.md`）。 |
| GLM-5-Air 主要承担控制流前置 | **已完成** | `PLAYER_CONTROL_PREFLIGHT` / `INTENT_PARSE` / `SAFETY_PREFILTER` 的 `primaryModel` 为 `glm-5-air`。 |
| 模型故障可平滑接管 | **已完成** | `execute.playerStream.fallback.test.ts`：mock DeepSeek 503 → GLM 流式 200；`errors/classify` 与熔断单测；预发仍建议人工过一遍（`regression-checklist.md`）。 |
| 本地与 Coolify 环境变量均可生效 | **已完成** | 统一经 `envRaw` / `resolveAiEnv` / `serverConfig` 读取；Coolify 注入 `process.env` 与 Next 加载 `.env.local` 行为一致（见 `environment.md`）。 |

## 自动化

- **命令**：`pnpm test:unit`
- **覆盖要点**：`validateCriticalEnv`、`registry` 白名单、`taskPolicy` 链/禁止表、`errors/classify`、`stream/openaiLike`、`providers` 请求体、`envCore`/`modeCore` 链解析与降级模式、`enhancementRulesPure` 门控、**`execute.playerStream.fallback`（SSE 多模型切换 mock）**。
- **E2E 契约**：`pnpm test:e2e:chat` — 校验 `/api/chat` 为 `text/event-stream`，消费完整 SSE 后 JSON 含 `narrative` + `is_action_legal`；可选 `E2E_USER`/`E2E_PASS` 时追加登录态 `page.request` 用例。
- **CI**：`.github/workflows/ci.yml` — `pnpm test:ci`（eslint + `pnpm test:unit` + `pnpm build`）；`main` 推送与 PR 均触发。
- **实现说明**：`router/execute` 与熔断/缓存/telemetry 等子模块已去掉 `server-only` 以便 Node 集成测；对外仍通过 `service.ts`（`server-only`）与 `config/env.ts` 入口收敛。
- **SSE 多行载荷**：`/api/chat` 的 `sse()` 对含换行的增量按规范拆成多行 `data:`，浏览器端按事件内多字段用 `\n` 拼接，避免 `\n\n` 误分帧导致 DM JSON 截断、界面长期「正在生成」。

## 未完成 / 待办（非阻塞项）

| 项 | 状态 | 风险 |
|----|------|------|
| Playwright 全链路（真实密钥 + 完整游玩） | **未完成** | 低：SSE 契约已断言 DM JSON 形状；全量仍依赖密钥与 `regression-checklist.md`。 |
| Coolify Build 阶段跑 `pnpm test:ci` | **建议** | 中：与 `ci.yml` 一致；仅镜像同步时需在 Coolify 构建命令中显式加入（见 `deployment-coolify.md`）。 |

## 签署说明

- **已完成**：代码与单测或文档可核对。  
- **风险点**：已在表中注明；上线前建议至少完成 `docs/regression-checklist.md` 一轮人工勾选。
