// src/lib/ai/tasks/routing.ts
/** Compatibility barrel: prefer `@/lib/ai/tasks/taskPolicy` in new code. */
import "server-only";

import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { assertModelAllowedForTask } from "@/lib/ai/tasks/taskPolicy";

export {
  assertModelAllowedForTask,
  assertRoleAllowedForTask,
  explainTaskRouting,
  exportTaskModelMatrixMarkdown,
  getTaskBinding,
  isModelForbiddenForTask,
  isRoleForbiddenForTask,
  resolveFallbackPolicy,
  resolveOrderedModelChain,
  resolveOrderedRoleChain,
  TASK_MODEL_FORBIDDEN,
  TASK_POLICY,
  TASK_ROLE_FORBIDDEN,
} from "@/lib/ai/tasks/taskPolicy";

export function assertPlayerChatModelAllowed(role: AiLogicalRole): void {
  assertModelAllowedForTask("PLAYER_CHAT", role);
}
