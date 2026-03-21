// src/lib/ai/tasks/routing.ts
/** Re-exports task policy + PLAYER_CHAT guard (legacy import path). */
import "server-only";

import type { AllowedModelId } from "@/lib/ai/models/registry";
import { assertModelAllowedForTask } from "@/lib/ai/tasks/taskPolicy";

export {
  assertModelAllowedForTask,
  explainTaskRouting,
  exportTaskModelMatrixMarkdown,
  getTaskBinding,
  isModelForbiddenForTask,
  resolveFallbackPolicy,
  resolveOrderedModelChain,
  TASK_MODEL_FORBIDDEN,
  TASK_POLICY,
} from "@/lib/ai/tasks/taskPolicy";

export function assertPlayerChatModelAllowed(modelId: AllowedModelId): void {
  assertModelAllowedForTask("PLAYER_CHAT", modelId);
}
