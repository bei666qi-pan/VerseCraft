// src/lib/ai/types/index.ts
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { AiRoutingReport } from "@/lib/ai/routing/types";

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
  /** Logical role that served the response (e.g. main, control). */
  logicalRole: AiLogicalRole;
  content: string;
  usage: import("@/lib/ai/types/core").TokenUsage | null;
  latencyMs: number;
  routing?: AiRoutingReport;
  /** Populated when `executeChatCompletion` served a cached payload. */
  fromCache?: boolean;
}

export interface AIErrorResponse {
  ok: false;
  code: string;
  message: string;
  providerId?: import("@/lib/ai/types/core").AiProviderId;
  logicalRole?: AiLogicalRole;
  status?: number;
  latencyMs?: number;
  routing?: AiRoutingReport;
}

export type AIResult = AIResponse | AIErrorResponse;
