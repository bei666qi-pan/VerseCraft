# 环境变量约定

## 加载顺序

- **本地**：使用仓库根目录的 `.env.local`（已 gitignore）。Next.js 还会读取 `.env`、`.env.development.local` 等；详见 [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)。
- **Coolify**：在面板 **Environment Variables** 中填写与 `.env.example` **同名**的键值；运行时注入 `process.env`，与本地文件等价。
- **业务代码**：禁止在 `src/` 内直接读 `process.env`。请使用：
  - 服务端：`@/lib/config/serverConfig`（`serverConfig` / `env`）与 `@/lib/ai/config/env`（`resolveAiEnv`）；单元测试可改用 `@/lib/ai/config/envCore` / `modeCore` 避免加载 `server-only`
  - 原始读取：`@/lib/config/envRaw`（仅限配置层）
  - 浏览器：仅 `NEXT_PUBLIC_*`，通过 `@/lib/config/publicRuntime` 的 `getPublicRuntimeConfig()`

## 启动校验

`src/lib/config/serverConfig.ts` 在进程加载时校验 **必填**：`DATABASE_URL`（PostgreSQL URL）、`AUTH_SECRET`（≥16 字符）。缺失或非法会在启动阶段抛出 `EnvValidationError`，避免首请求才失败。

`src/instrumentation.ts` 在 Node 运行时启动时加载上述模块，便于尽早失败。

## 密钥与前端

- **不得**将任何 API Key、数据库 URL、`AUTH_SECRET`、`AUDIT_HMAC_SECRET` 等设为 `NEXT_PUBLIC_*`。
- 用户可见报错文案中不得包含密钥内容（见代码审查要点）。

## 命名与兼容

- **推荐（文档与 `.env.example`）**：`MODERATION_*`、`SECURITY_LOG_LEVEL`、`AUDIT_HMAC_SECRET`。
- **仍受支持（Coolify 旧配置无需立即改）**：`SECURITY_MODERATION_*`、`SECURITY_AUDIT_LOG_LEVEL`、`SECRET_KEY`（审计 HMAC，优先使用 `AUDIT_HMAC_SECRET`）。
- **智谱**：`ZHIPU_API_KEY` 为主；`BIGMODEL_API_KEY` 为别名，在 `resolveAiEnv` 中解析。
