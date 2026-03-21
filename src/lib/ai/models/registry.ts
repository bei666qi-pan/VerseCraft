// src/lib/ai/models/registry.ts
import type { AiProviderId, ModelCapability } from "@/lib/ai/types/core";

/** Whitelist: only these logical models may be invoked by the router. */
export const ALLOWED_MODEL_IDS = [
  "deepseek-reasoner",
  "deepseek-v3.2",
  "glm-5-air",
  "MiniMax-M2.7-highspeed",
] as const;

export type AllowedModelId = (typeof ALLOWED_MODEL_IDS)[number];

export interface RegisteredModel {
  id: AllowedModelId;
  /** Value sent to vendor API `model` field. */
  apiModel: string;
  provider: AiProviderId;
  displayName: string;
  capabilities: ModelCapability[];
  /** If true, router rejects use on `PLAYER_CHAT` and other realtime tasks. */
  offlineOnly: boolean;
}

const REGISTRY: Record<AllowedModelId, RegisteredModel> = {
  "deepseek-reasoner": {
    id: "deepseek-reasoner",
    apiModel: "deepseek-reasoner",
    provider: "deepseek",
    displayName: "DeepSeek Reasoner",
    capabilities: ["chat", "stream", "json_mode", "reasoning"],
    offlineOnly: true,
  },
  "deepseek-v3.2": {
    id: "deepseek-v3.2",
    apiModel: "deepseek-chat", // pragma: allowlist secret
    provider: "deepseek",
    displayName: "DeepSeek-V3.2",
    capabilities: ["chat", "stream", "json_mode"],
    offlineOnly: false,
  },
  "glm-5-air": {
    id: "glm-5-air",
    apiModel: "glm-4-flash",
    provider: "zhipu",
    displayName: "GLM-5-Air",
    capabilities: ["chat", "stream", "json_mode"],
    offlineOnly: false,
  },
  "MiniMax-M2.7-highspeed": {
    id: "MiniMax-M2.7-highspeed",
    apiModel: "MiniMax-M2.7-highspeed",
    provider: "minimax",
    displayName: "MiniMax-M2.7-highspeed",
    capabilities: ["chat", "stream", "high_speed_variant"],
    offlineOnly: false,
  },
};

const ALIASES: Record<string, AllowedModelId> = {
  "deepseek-reasoner": "deepseek-reasoner",
  "deepseek-v3.2": "deepseek-v3.2",
  "deepseek-chat": "deepseek-v3.2",
  "deepseek-v3.2-chat": "deepseek-v3.2",
  "DeepSeek-V3.2": "deepseek-v3.2",
  "glm-5-air": "glm-5-air",
  "GLM-5-Air": "glm-5-air",
  "MiniMax-M2.7-highspeed": "MiniMax-M2.7-highspeed",
};

export function normalizeAllowedModelId(raw: string | undefined | null): AllowedModelId | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const direct = ALIASES[trimmed];
  if (direct) return direct;
  const lower = trimmed.toLowerCase();
  if (lower === "deepseek-chat" || lower === "deepseek-v3.2" || lower === "deepseek-reasoner") {
    if (lower === "deepseek-reasoner") return "deepseek-reasoner";
    return "deepseek-v3.2";
  }
  if (ALLOWED_MODEL_IDS.includes(trimmed as AllowedModelId)) {
    return trimmed as AllowedModelId;
  }
  return null;
}

export function getRegisteredModel(id: AllowedModelId): RegisteredModel {
  return REGISTRY[id];
}

export function assertAllowedModel(id: string): asserts id is AllowedModelId {
  if (!ALLOWED_MODEL_IDS.includes(id as AllowedModelId)) {
    throw new Error(`[ai] Model not in whitelist: ${id}`);
  }
}

export function listAllowedModels(): RegisteredModel[] {
  return [...ALLOWED_MODEL_IDS].map((id) => REGISTRY[id]);
}
