// src/lib/ai/tasks/routing.ts
/** Compatibility barrel: prefer `@/lib/ai/tasks/taskPolicy` in new code. */
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
