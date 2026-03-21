// src/lib/ai/service.ts
/**
 * Primary facade for server-side AI calls. Business code should import from here
 * (or `@/lib/ai`) instead of calling fetch/SDK directly.
 */
import "server-only";

export {
  executePlayerChatStream,
  executeChatCompletion,
  type PlayerChatStreamResult,
} from "@/lib/ai/router/execute";
export { resolveAiEnv, anyAiProviderConfigured, resolveDeepSeekLegacyConfig } from "@/lib/ai/config/env";
export { sanitizeMessagesForUpstream } from "@/lib/ai/stream/sanitize";
export { ALLOWED_MODEL_IDS, getRegisteredModel, normalizeAllowedModelId, type AllowedModelId } from "@/lib/ai/models/registry";
export type {
  TaskType,
  ChatMessage,
  AIRequestContext,
  AIResponse,
  AIErrorResponse,
  ModelCapability,
  StreamChunk,
  FallbackPolicy,
  ProviderClient,
} from "@/lib/ai/types";
