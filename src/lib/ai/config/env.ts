// src/lib/ai/config/env.ts
import "server-only";

export type { ResolvedAiEnv } from "@/lib/ai/config/envCore";
export {
  anyAiProviderConfigured,
  DEFAULT_PLAYER_CHAIN,
  DEFAULT_PLAYER_ROLE_CHAIN,
  resolveAiEnv,
  resolveGatewayPrimaryBinding,
  resolveDeepSeekLegacyConfig,
} from "@/lib/ai/config/envCore";
