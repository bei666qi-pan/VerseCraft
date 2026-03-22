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
export {
  AI_LOGICAL_ROLES,
  isAiLogicalRole,
  legacyVendorModelIdToRole,
  normalizeAiLogicalRole,
  parseRoleChain,
  type AiLogicalRole,
} from "@/lib/ai/models/logicalRoles";
export {
  TASK_POLICY,
  TASK_MODEL_FORBIDDEN,
  TASK_ROLE_FORBIDDEN,
  getTaskBinding,
  explainTaskRouting,
  exportTaskModelMatrixMarkdown,
  isModelForbiddenForTask,
  assertModelAllowedForTask,
  resolveOrderedRoleChain,
} from "@/lib/ai/tasks/taskPolicy";
export type { TaskBinding, BudgetLevel } from "@/lib/ai/tasks/taskPolicy";
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
