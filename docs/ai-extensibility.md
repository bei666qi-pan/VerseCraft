# AI 层扩展约定（面向未来）

## 新增逻辑模型（白名单）

1. 在 `src/lib/ai/models/registry.ts` 的 `ALLOWED_MODEL_IDS` 与 `REGISTRY` 各增一行；必要时补 `ALIASES`。
2. 若新模型属于新厂商：扩展 `AiProviderId` 与 `providers/*` 工厂，并在 `router/execute.ts` 的 `providerEndpoint` / `streamUsageFlag` 等处接线。
3. 在 `tasks/taskPolicy.ts` 的 `TASK_POLICY` 与 `TASK_MODEL_FORBIDDEN` 声明任务绑定；**不要**在业务页面临时 `fetch` 厂商 URL。

## 新增任务类型

1. 在 `src/lib/ai/types/core.ts` 的 `TaskType` 增加枚举值。
2. 仅改 `taskPolicy.ts`：`TASK_POLICY[task]` + `TASK_MODEL_FORBIDDEN[task]`。
3. 业务侧通过 `executeChatCompletion({ task })` 或（仅玩家主叙事）`executePlayerChatStream` 调用；禁止绕过 `service.ts`。

## 配置变更

- 路由与密钥：只动 `.env.example` / `docs/environment.md` 与 `envCore.ts`（解析逻辑）；避免在 `src/app` 散落 `process.env`。
- 熔断/重试/超时：`envCore.ts` 中 `AI_*` 已有字段；无需改执行器核心。

## 自动化回归

- `pnpm test:unit`：含 `execute.playerStream.fallback.test.ts`（mock 上游 503 → 次模型流式成功）。
- `pnpm test:e2e:chat`：`/api/chat` SSE 传输契约（需本地 `pnpm dev` 或 Playwright `webServer`）。
