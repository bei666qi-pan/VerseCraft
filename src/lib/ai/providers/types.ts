// src/lib/ai/providers/types.ts
import type { AiProviderId } from "@/lib/ai/types/core";
import type { ChatMessage, ToolChoiceOption, ToolDefinition } from "@/lib/ai/types/core";

export interface NormalizedCompletionRequest {
  modelApiName: string;
  messages: ChatMessage[];
  stream: boolean;
  maxTokens: number;
  temperature?: number;
  responseFormatJsonObject?: boolean;
  streamIncludeUsage?: boolean;
  /** Function tools for this request (policy-gated upstream in taskPolicy; offline tasks only). */
  tools?: readonly ToolDefinition[];
  /** Only sent when `tools` is non-empty. */
  toolChoice?: ToolChoiceOption;
  /** Shallow-merged into JSON body when set (PLAYER_CHAT + gateway switch); cannot override reserved keys. */
  extraBody?: Record<string, unknown>;
}

export interface ProviderRequestFactory {
  readonly id: AiProviderId;
  buildInit(apiKey: string, body: NormalizedCompletionRequest): RequestInit;
}

/** Unified vendor adapter for official HTTP chat completions. */
export type ProviderClient = ProviderRequestFactory;
