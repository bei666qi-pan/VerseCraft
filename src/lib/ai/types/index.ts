// src/lib/ai/types/index.ts
import type { AllowedModelId } from "@/lib/ai/models/registry";

export type {
  AiProviderId,
  TaskType,
  ModelCapability,
  ChatRole,
  ChatMessage,
  AIRequestContext,
  TokenUsage,
  StreamChunk,
  FallbackPolicy,
  OpenAiStreamFrame,
} from "@/lib/ai/types/core";

// Re-export ProviderClient naming contract (alias of ProviderRequestFactory).
export type { ProviderClient } from "@/lib/ai/providers/types";

/** Non-streaming completion result. */
export interface AIResponse {
  ok: true;
  providerId: import("@/lib/ai/types/core").AiProviderId;
  modelId: AllowedModelId;
  content: string;
  usage: import("@/lib/ai/types/core").TokenUsage | null;
  latencyMs: number;
}

export interface AIErrorResponse {
  ok: false;
  code: string;
  message: string;
  providerId?: import("@/lib/ai/types/core").AiProviderId;
  modelId?: AllowedModelId;
  status?: number;
  latencyMs?: number;
}

export type AIResult = AIResponse | AIErrorResponse;
