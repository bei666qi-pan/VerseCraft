// src/lib/ai/service.ts
/**
 * 服务端 AI 模块边界：
 * - **业务 / 玩法**：优先从 `@/lib/ai/logicalTasks` 调用语义入口（`generateMainReply`、`parsePlayerIntent` 等）。
 * - **路由与契约测试**：可直接使用下方 `executePlayerChatStream` / `executeChatCompletion`（与 `TaskType` 对齐，不经由 logicalTasks）。
 */
import "server-only";

export {
  compressSessionMemory,
  enhanceScene,
  generateMainReply,
  narrateCombat,
  parsePlayerIntent,
  resolveRuleOutcome,
  runOfflineReasonerTask,
  type OfflineReasonerKind,
} from "@/lib/ai/logicalTasks";
export {
  executePlayerChatStream,
  executeChatCompletion,
  type PlayerChatStreamResult,
} from "@/lib/ai/router/execute";
export {
  runToolLoop,
  type RegisteredTool,
  type ToolHandlerContext,
  type ToolLoopResult,
  type ToolLoopTrace,
  type ToolRegistry,
} from "@/lib/ai/tools/runToolLoop";
export {
  resolveAiEnv,
  anyAiProviderConfigured,
  resolveGatewayPrimaryBinding,
  resolveDeepSeekLegacyConfig,
} from "@/lib/ai/config/env";
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
  TASK_TOOLS_ALLOWED,
  getTaskBinding,
  explainTaskRouting,
  exportTaskModelMatrixMarkdown,
  isModelForbiddenForTask,
  isToolUseAllowedForTask,
  assertModelAllowedForTask,
  assertToolUseAllowedForTask,
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
  ToolCall,
  ToolChoiceOption,
  ToolDefinition,
} from "@/lib/ai/types";
