# VerseCraft AI 网关（one-api）说明

本文是 **AI 统一网关** 的单一入口文档，与 `docs/ai-architecture.md`（模块目录）互补。

## 1. 架构说明

- **所有大模型 HTTP 调用**经 [`src/lib/ai/router/execute.ts`](../src/lib/ai/router/execute.ts) 发往 **一个** OpenAI 兼容端点：`AI_GATEWAY_BASE_URL` 解析为 `…/v1/chat/completions`（或你提供的完整 `…/chat/completions` URL）。
- **请求体**由 [`src/lib/ai/gateway/openaiCompatible.ts`](../src/lib/ai/gateway/openaiCompatible.ts) 构造；**Bearer** 使用 `AI_GATEWAY_API_KEY`。
- **业务只认逻辑角色**：`main` / `control` / `enhance` / `reasoner`（见 [`logicalRoles.ts`](../src/lib/ai/models/logicalRoles.ts)）。角色到上游模型名的映射 **仅** 来自环境变量 `AI_MODEL_*`，不在业务 TS 里写死厂商型号字符串。
- **任务路由**见 [`taskPolicy.ts`](../src/lib/ai/tasks/taskPolicy.ts)；玩家流式 fallback 顺序可由 `AI_PLAYER_ROLE_CHAIN`（或兼容旧 `AI_PLAYER_MODEL_CHAIN`）调整。
- **配置读取**统一走 [`envCore.ts`](../src/lib/ai/config/envCore.ts) / [`envRaw.ts`](../src/lib/config/envRaw.ts)；`src/` 内除配置层与 Next 框架约定（如 `NODE_ENV`）外不应直接读 `process.env`。

## 2. 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_GATEWAY_PROVIDER` | 否 | 默认 `oneapi` |
| `AI_GATEWAY_BASE_URL` | 是* | one-api 根 URL 或完整 chat-completions URL |
| `AI_GATEWAY_API_KEY` | 是* | 网关访问令牌（勿 `NEXT_PUBLIC_*`） |
| `AI_MODEL_MAIN` | 是* | 主叙事、多数裁决类任务 |
| `AI_MODEL_CONTROL` | 建议 | 控制面 / 意图 / 安全预筛 |
| `AI_MODEL_ENHANCE` | 建议 | 场景增强、情绪润色 |
| `AI_MODEL_REASONER` | 建议 | 离线推演、管理洞察 |
| `AI_PLAYER_ROLE_CHAIN` | 否 | 玩家 SSE 候选顺序，如 `main,control` |
| `AI_PLAYER_MODEL_CHAIN` | 否 | **遗留**：旧厂商 id 会映射为角色 |
| `AI_MEMORY_PRIMARY_ROLE` / `AI_MEMORY_MODEL` | 否 | 记忆压缩链首选 |
| `AI_DEV_ASSIST_PRIMARY_ROLE` / `AI_ADMIN_MODEL` | 否 | 管理洞察链首选 |
| `AI_REQUEST_TIMEOUT_MS` / `AI_TIMEOUT_MS` | 否 | 超时毫秒 |
| `AI_ENABLE_STREAM` | 否 | 默认 `true`；与任务 `stream` 组合 |
| `AI_LOG_LEVEL` | 否 | `silent` \| `error` \| `info` \| `debug` |
| `AI_MAX_RETRIES` 等 | 否 | 重试与熔断，见 `.env.example` |

\*：`anyAiProviderConfigured()` 要求至少 **网关 URL + Key + `AI_MODEL_MAIN`** 非空；其他角色若未配置，对应任务链会自动跳过该角色。

完整列表以仓库根目录 [`.env.example`](../.env.example) 为准。

## 3. 本地运行说明

1. `cp .env.example .env.local`
2. 将 `AI_GATEWAY_BASE_URL` 指向 **本机 one-api**（例如 `http://127.0.0.1:3000`，应用会自动补 `/v1/chat/completions`，除非已写完整路径）。
3. 填写 `AI_GATEWAY_API_KEY` 与四个 `AI_MODEL_*`（与 one-api 中配置的模型名一致）。
4. `pnpm dev`，浏览器访问 `http://localhost:666`（见 `docs/local-development.md`）。
5. 可选：`pnpm verify:ai-gateway` 快速检查当前 shell + `.env.local` 下网关配置是否齐全（不发起真实对话）。

## 4. Coolify / 生产配置说明

在 Coolify **Environment Variables** 中配置与 `.env.example` **同名**的键（不要使用 `.env.local` 文件）。至少包含：

- `DATABASE_URL`、`AUTH_SECRET`、及其他已有生产项
- `AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`
- `AI_MODEL_MAIN`、`AI_MODEL_CONTROL`、`AI_MODEL_ENHANCE`、`AI_MODEL_REASONER`

容器内应用与本地共用同一套代码路径；**无**「仅线上」或「仅本地」分支。

## 5. 切模型操作说明（最小路径）

1. **优先**：在 **one-api 控制台** 修改渠道或模型映射，使原 `AI_MODEL_*` 字符串仍指向同一逻辑名，但上游已换模型 → **VerseCraft 零改**。
2. **其次**：只改 Coolify / `.env.local` 中的 **`AI_MODEL_MAIN`**（或对应角色变量）为新 one-api 模型 id → **不改业务代码**。
3. **再其次**：调整 **`AI_PLAYER_ROLE_CHAIN`** 改变玩家 fallback 顺序（仍为角色名，非厂商字符串）。
4. 避免在多个业务模块改模型；若出现需改 TS 的情况，应视为配置抽象不足，应收到 `envCore` / `taskPolicy` 而非散落到 feature 代码。

## 6. 常见故障排查

| 现象 | 检查 |
|------|------|
| 进入游戏提示未配置大模型 / SSE 降级文案 | `AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`、`AI_MODEL_MAIN` 是否非空；`pnpm verify:ai-gateway` |
| 502 / 链上全部失败 | one-api 是否可达、令牌是否有效、one-api 内模型名是否与 `AI_MODEL_*` 一致 |
| 仅主模型失败、副角色成功 | 看结构化日志 `logicalRole` / `gatewayModel`；检查对应 `AI_MODEL_*` |
| 流式无输出 | `AI_ENABLE_STREAM`、上游是否支持 SSE；见 `docs/troubleshooting-ai.md` |
| JSON 结构异常 | 上游是否支持 `json_object`；控制类任务需要 JSON 时应在 one-api 侧选支持该模式的模型 |

更细的分类与日志字段说明见 [`docs/troubleshooting-ai.md`](troubleshooting-ai.md)。

## 7. 测试与回归

- **单元**：`pnpm test:unit`（含 `envCore`、`taskPolicy`、流式 fallback mock、`openaiCompatible` 请求体）。
- **网关验证脚本**：`pnpm verify:ai-gateway`（配置完整性，不扣费）。
- **端到端**：配置好 env 后可用 Playwright `e2e/chat-sse-contract.spec.ts` 等（需可访问的网关）。
