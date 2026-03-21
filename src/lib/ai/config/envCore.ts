// src/lib/ai/config/envCore.ts
/**
 * AI env resolution without `server-only` so Node unit tests (tsx) can import safely.
 * App code should import `@/lib/ai/config/env` (adds server-only guard).
 */
import { envBoolean, envNumber, envRaw, envRawFirst } from "@/lib/config/envRaw";
import { normalizeAllowedModelId, type AllowedModelId } from "@/lib/ai/models/registry";

function parseModelChain(raw: string | undefined, fallback: AllowedModelId[]): AllowedModelId[] {
  if (!raw) return fallback;
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: AllowedModelId[] = [];
  for (const p of parts) {
    const id = normalizeAllowedModelId(p);
    if (id) out.push(id);
  }
  return out.length > 0 ? out : fallback;
}

export interface ResolvedAiEnv {
  deepseek: {
    apiUrl: string;
    apiKey: string;
    /** Default model id when env does not override (must be allowed). */
    defaultModel: AllowedModelId;
  };
  zhipu: {
    apiUrl: string;
    apiKey: string;
    defaultModel: AllowedModelId;
  };
  minimax: {
    apiUrl: string;
    apiKey: string;
    defaultModel: AllowedModelId;
  };
  /** Player realtime fallback order (excludes offline-only models). */
  playerChatFallbackChain: AllowedModelId[];
  memoryCompressionModel: AllowedModelId;
  adminInsightModel: AllowedModelId;
  /** Global defaults for resilience */
  defaultTimeoutMs: number;
  maxRetries: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
  /** When true, `/api/chat` may attach routing debug header. */
  exposeAiRoutingHeader: boolean;
}

/** Extra candidates merged after policy primaries for PLAYER_CHAT only; MiniMax excluded by task forbid list. */
export const DEFAULT_PLAYER_CHAIN: AllowedModelId[] = ["deepseek-v3.2", "glm-5-air"];

function resolveDeepseekChatCompletionsUrl(): string {
  const explicit = envRaw("DEEPSEEK_API_URL");
  if (explicit) return explicit;
  const base = envRaw("DEEPSEEK_BASE_URL");
  if (!base) return "https://api.deepseek.com/chat/completions";
  const normalized = base.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  return `${normalized}/chat/completions`;
}

export function resolveAiEnv(): ResolvedAiEnv {
  // Canonical names first. Extra keys reduce false "no provider" when .env uses common aliases or mistaken NEXT_PUBLIC_ prefix.
  const deepseekKey =
    envRawFirst([
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_KEY",
      "DEEPSEEK_API_TOKEN",
      "NEXT_PUBLIC_DEEPSEEK_API_KEY",
    ]) ?? "";
  const zhipuKey =
    envRawFirst(["ZHIPU_API_KEY", "BIGMODEL_API_KEY", "GLM_API_KEY", "ZHIPU_KEY"]) ?? "";
  const minimaxKey = envRawFirst(["MINIMAX_API_KEY", "MINIMAX_KEY"]) ?? "";

  const deepseekModel =
    normalizeAllowedModelId(envRawFirst(["DEEPSEEK_MODEL", "AI_DEFAULT_MODEL"])) ??
    ("deepseek-v3.2" as AllowedModelId);
  const zhipuModel =
    normalizeAllowedModelId(envRaw("ZHIPU_MODEL")) ?? ("glm-5-air" as AllowedModelId);
  const minimaxModel =
    normalizeAllowedModelId(envRaw("MINIMAX_MODEL")) ?? ("MiniMax-M2.7-highspeed" as AllowedModelId);

  return {
    deepseek: {
      apiUrl: resolveDeepseekChatCompletionsUrl(),
      apiKey: deepseekKey,
      defaultModel: deepseekModel,
    },
    zhipu: {
      apiUrl: envRaw("ZHIPU_API_URL") ?? "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      apiKey: zhipuKey,
      defaultModel: zhipuModel,
    },
    minimax: {
      apiUrl: envRaw("MINIMAX_API_URL") ?? "https://api.minimax.io/v1/text/chatcompletion_v2",
      apiKey: minimaxKey,
      defaultModel: minimaxModel,
    },
    playerChatFallbackChain: parseModelChain(envRaw("AI_PLAYER_MODEL_CHAIN"), DEFAULT_PLAYER_CHAIN),
    memoryCompressionModel:
      normalizeAllowedModelId(envRaw("AI_MEMORY_MODEL")) ?? ("deepseek-v3.2" as AllowedModelId),
    adminInsightModel:
      normalizeAllowedModelId(envRaw("AI_ADMIN_MODEL")) ?? ("deepseek-reasoner" as AllowedModelId),
    defaultTimeoutMs: (() => {
      const primary = envNumber("AI_TIMEOUT_MS", NaN);
      return Number.isFinite(primary) ? primary : envNumber("AI_REQUEST_TIMEOUT_MS", 60_000);
    })(),
    maxRetries: (() => {
      const primary = envNumber("AI_MAX_RETRIES", NaN);
      return Number.isFinite(primary) ? primary : envNumber("AI_RETRY_COUNT", 2);
    })(),
    circuitFailureThreshold: envNumber("AI_CIRCUIT_FAILURE_THRESHOLD", 4),
    circuitCooldownMs: envNumber("AI_CIRCUIT_COOLDOWN_MS", 60_000),
    exposeAiRoutingHeader: envBoolean("AI_EXPOSE_ROUTING_HEADER", false),
  };
}

export function anyAiProviderConfigured(): boolean {
  const e = resolveAiEnv();
  return e.deepseek.apiKey.length > 0 || e.zhipu.apiKey.length > 0 || e.minimax.apiKey.length > 0;
}

/** Resolves DeepSeek endpoint for narrow legacy call sites. */
export function resolveDeepSeekLegacyConfig(): { apiUrl: string; apiKey: string; model: string } {
  const e = resolveAiEnv();
  const reg = e.deepseek.defaultModel;
  return {
    apiUrl: e.deepseek.apiUrl,
    apiKey: e.deepseek.apiKey,
    model: reg,
  };
}
