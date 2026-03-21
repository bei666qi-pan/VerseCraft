// src/lib/ai/config/env.ts
import "server-only";

import { normalizeAllowedModelId, type AllowedModelId } from "@/lib/ai/models/registry";

type EnvValue = string | undefined;

function readEnv(name: string): EnvValue {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnvAsNumber(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
}

export const DEFAULT_PLAYER_CHAIN: AllowedModelId[] = [
  "deepseek-v3.2",
  "glm-5-air",
  "MiniMax-M2.7-highspeed",
];

export function resolveAiEnv(): ResolvedAiEnv {
  const deepseekKey = readEnv("DEEPSEEK_API_KEY") ?? "";
  const zhipuKey = readEnv("ZHIPU_API_KEY") ?? readEnv("BIGMODEL_API_KEY") ?? "";
  const minimaxKey = readEnv("MINIMAX_API_KEY") ?? "";

  const deepseekModel =
    normalizeAllowedModelId(readEnv("DEEPSEEK_MODEL")) ?? ("deepseek-v3.2" as AllowedModelId);
  const zhipuModel =
    normalizeAllowedModelId(readEnv("ZHIPU_MODEL")) ?? ("glm-5-air" as AllowedModelId);
  const minimaxModel =
    normalizeAllowedModelId(readEnv("MINIMAX_MODEL")) ?? ("MiniMax-M2.7-highspeed" as AllowedModelId);

  return {
    deepseek: {
      apiUrl: readEnv("DEEPSEEK_API_URL") ?? "https://api.deepseek.com/chat/completions",
      apiKey: deepseekKey,
      defaultModel: deepseekModel,
    },
    zhipu: {
      apiUrl: readEnv("ZHIPU_API_URL") ?? "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      apiKey: zhipuKey,
      defaultModel: zhipuModel,
    },
    minimax: {
      apiUrl: readEnv("MINIMAX_API_URL") ?? "https://api.minimax.io/v1/text/chatcompletion_v2",
      apiKey: minimaxKey,
      defaultModel: minimaxModel,
    },
    playerChatFallbackChain: parseModelChain(readEnv("AI_PLAYER_MODEL_CHAIN"), DEFAULT_PLAYER_CHAIN),
    memoryCompressionModel:
      normalizeAllowedModelId(readEnv("AI_MEMORY_MODEL")) ?? ("deepseek-v3.2" as AllowedModelId),
    adminInsightModel:
      normalizeAllowedModelId(readEnv("AI_ADMIN_MODEL")) ?? ("deepseek-reasoner" as AllowedModelId),
    defaultTimeoutMs: readEnvAsNumber("AI_TIMEOUT_MS", 60_000),
    maxRetries: readEnvAsNumber("AI_MAX_RETRIES", 2),
    circuitFailureThreshold: readEnvAsNumber("AI_CIRCUIT_FAILURE_THRESHOLD", 4),
    circuitCooldownMs: readEnvAsNumber("AI_CIRCUIT_COOLDOWN_MS", 60_000),
  };
}

export function anyAiProviderConfigured(): boolean {
  const e = resolveAiEnv();
  return e.deepseek.apiKey.length > 0 || e.zhipu.apiKey.length > 0 || e.minimax.apiKey.length > 0;
}

/** @deprecated Use resolveAiEnv().deepseek via AI layer; kept for narrow backward compatibility. */
export function resolveDeepSeekLegacyConfig(): { apiUrl: string; apiKey: string; model: string } {
  const e = resolveAiEnv();
  const reg = e.deepseek.defaultModel;
  return {
    apiUrl: e.deepseek.apiUrl,
    apiKey: e.deepseek.apiKey,
    model: reg,
  };
}
