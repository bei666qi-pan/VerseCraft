// src/lib/env.ts
/**
 * Application environment (server-only). Re-exports validated `serverConfig` as `env` for legacy imports.
 * All secrets and tunables are loaded via `@/lib/config/serverConfig` — do not read `process.env` in feature code.
 */
import "server-only";

import { resolveDeepSeekLegacyConfig } from "@/lib/ai/config/env";
import { serverConfig, type ServerConfig } from "@/lib/config/serverConfig";

export type { ServerConfig };

/** @deprecated Prefer importing `serverConfig` from `@/lib/config/serverConfig`. */
export const env: ServerConfig = serverConfig;

export type DeepSeekConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
};

/** Delegates to unified AI env (whitelist + defaults). */
export function resolveDeepSeekConfig(): DeepSeekConfig {
  const x = resolveDeepSeekLegacyConfig();
  return { apiUrl: x.apiUrl, apiKey: x.apiKey, model: x.model };
}
