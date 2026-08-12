// src/lib/ai/config/env.ts
import "server-only";

export type { ResolvedAiEnv } from "@/lib/ai/config/envCore";
export {
  anyAiProviderConfigured,
  DEFAULT_PLAYER_ROLE_CHAIN,
  isMockAiProviderEnv,
  resolveAiEnv,
  resolveGatewayPrimaryBinding,
  resolveEmbeddingBinding,
} from "@/lib/ai/config/envCore";
