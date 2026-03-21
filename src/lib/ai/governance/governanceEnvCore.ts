// src/lib/ai/governance/governanceEnvCore.ts
/** Governance knobs without `server-only` (shared with response cache + unit tests). */
import { envBoolean, envNumber, envRaw } from "@/lib/config/envRaw";

export const aiGovernanceEnv = {
  /** Bumps cache namespace for offline-style completions when prompts change. */
  cacheContentVersion: envRaw("VERSECRAFT_AI_CACHE_VERSION") ?? "1",
  responseCacheEnabled: envBoolean("AI_RESPONSE_CACHE_ENABLED", true),
  controlPreflightCacheTtlSec: envNumber("AI_CACHE_TTL_CONTROL_SEC", 50),
  preflightMaxPerMinutePerSession: envNumber("AI_PREFLIGHT_MAX_PER_MINUTE", 48),
  enhanceCooldownSec: envNumber("AI_ENHANCE_COOLDOWN_SEC", 90),
  enhanceMaxPerHourPerSession: envNumber("AI_ENHANCE_MAX_PER_HOUR", 10),
};
