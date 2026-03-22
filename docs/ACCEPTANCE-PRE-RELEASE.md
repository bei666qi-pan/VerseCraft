# 上线前验收报告 — AI 网关（one-api）与逻辑角色

**日期**：2026-03-22（文档随仓库迭代）  
**范围**：`src/lib/ai/*`（统一网关）、配置层、内容安全、CI/E2E、文档与 `pnpm test:unit` / `pnpm verify:ai-gateway`。

## 结论总表

| 验收项 | 状态 | 说明 |
|--------|------|------|
| 全部大模型 HTTP 经 **单一 OpenAI 兼容端点** | **已完成** | `execute.ts` + `openaiCompatible.ts`；`AI_GATEWAY_BASE_URL` / `AI_GATEWAY_API_KEY`。 |
| 业务只依赖 **逻辑角色**（非散落厂商型号） | **已完成** | `main` / `control` / `enhance` / `reasoner`；`taskPolicy.ts` + `envCore` 的 `AI_MODEL_*`。 |
| `reasoner` 不进入在线玩家主链路 | **已完成** | `TASK_ROLE_FORBIDDEN`；单测覆盖。 |
| `enhance` 仅用于门控任务 | **已完成** | `SCENE_ENHANCEMENT` / `NPC_EMOTION_POLISH`；`enhancementRulesPure` + 会话预算。 |
| 本地 `.env.local` 与 Coolify **同名变量** | **已完成** | 无「仅本地 / 仅线上」分支；见 `docs/ai-gateway.md`、`environment.md`。 |
| 切模型优先 one-api / 次选改 env | **已完成** | 见 `docs/ai-gateway.md` 第五节；`.env.example` 中 `AI_MODEL_*` 为占位 id。 |
| 链失败可降级与友好错误 | **已完成** | `execute.gateway-contract.test.ts`、`errors/classify`；人工清单 `regression-checklist.md`。 |

## 自动化

- **命令**：`pnpm test:unit`
- **覆盖要点**：`envCore`、`taskPolicy` 链/禁止表、`errors/classify`、`stream/openaiLike`、`openaiCompatible` 请求体、玩家流式 fallback mock、**网关契约**（链耗尽、首跳 `model` 与 `AI_MODEL_MAIN`、URL 归一化）。
- **网关自检**：`pnpm verify:ai-gateway`（加载 `.env` / `.env.local`，不发起扣费请求；`VERIFY_AI_GATEWAY_STRICT=1` 可在 CI 中强制非空）。
- **E2E 契约**：`pnpm test:e2e:chat` — 校验 `/api/chat` 为 `text/event-stream`，消费完整 SSE 后 JSON 含 `narrative` + `is_action_legal`；需可访问网关。
- **CI**：`.github/workflows/ci.yml` — `pnpm test:ci`（eslint + `pnpm test:unit` + `pnpm build`）。
- **实现说明**：`router/execute` 等子模块可脱离 `server-only` 以便 Node 单测；对外仍通过 `service.ts` 收敛。

## 未完成 / 待办（非阻塞项）

| 项 | 状态 | 风险 |
|----|------|------|
| Playwright 全链路（真实密钥 + 完整游玩） | **未完成** | 低：SSE 与网关契约已测；全量仍依赖环境与 `regression-checklist.md`。 |
| Coolify Build 阶段跑 `pnpm test:ci` | **建议** | 中：与 `ci.yml` 一致；需在构建命令中显式加入（见 `deployment-coolify.md`）。 |

## 签署说明

- **已完成**：代码与单测或文档可核对。  
- **风险点**：已在表中注明；上线前建议至少完成 `docs/regression-checklist.md` 一轮人工勾选。
