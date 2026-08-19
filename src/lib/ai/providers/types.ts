// src/lib/ai/providers/types.ts
import type { AiProviderId } from "@/lib/ai/types/core";
import type { ChatMessage, ToolChoiceOption, ToolDefinition } from "@/lib/ai/types/core";

export interface NormalizedCompletionRequest {
  modelApiName: string;
  messages: ChatMessage[];
  stream: boolean;
  /** Legacy advisory only. The OpenAI-compatible transport omits max_tokens. */
  maxTokens?: number;
  temperature?: number;
  responseFormatJsonObject?: boolean;
  /**
   * Provider-level strict JSON Schema constraint (OpenAI Structured Outputs
   * `response_format: {type:"json_schema", json_schema:{name, strict, schema}}`
   * or equivalent). When set, takes priority over `responseFormatJsonObject`
   * in provider adapters that support it. Opt-in only — see
   * `src/lib/ai/config/envCore.ts` `aiGatewayJsonSchemaEnabled` — because not
   * every provider behind an OpenAI-compatible gateway implements this mode;
   * sending it to an unsupported provider can cause hard 4xx failures instead
   * of graceful degradation.
   */
  responseFormatJsonSchema?: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
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
