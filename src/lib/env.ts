// src/lib/env.ts
/**
 * Application environment (server-only). Re-exports validated `serverConfig` as `env` for legacy imports.
 * All secrets and tunables are loaded via `@/lib/config/serverConfig` — do not read `process.env` in feature code.
 */
import "server-only";

import { resolveGatewayPrimaryBinding } from "@/lib/ai/config/env";
import { serverConfig, type ServerConfig } from "@/lib/config/serverConfig";

export type { ServerConfig };

/** @deprecated Prefer importing `serverConfig` from `@/lib/config/serverConfig`. */
export const env: ServerConfig = serverConfig;

/** 与 one-api 主通道绑定的 URL / 密钥 / 模型 id（opaque，由网关注册）。 */
export type GatewayChatBinding = {
  apiUrl: string;
  apiKey: string;
  model: string;
};

/** @deprecated 使用 `GatewayChatBinding` / `resolveGatewayChatBinding`。 */
export type DeepSeekConfig = GatewayChatBinding;

/** 自统一 AI 环境解析（供诊断等使用）。 */
export function resolveGatewayChatBinding(): GatewayChatBinding {
  const x = resolveGatewayPrimaryBinding();
  return { apiUrl: x.apiUrl, apiKey: x.apiKey, model: x.model };
}

/** @deprecated 使用 `resolveGatewayChatBinding`。 */
export function resolveDeepSeekConfig(): GatewayChatBinding {
  return resolveGatewayChatBinding();
}
