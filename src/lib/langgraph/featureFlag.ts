// src/lib/langgraph/featureFlag.ts
/**
 * Feature flag gate for LangGraph-based director orchestration.
 *
 * Controlled by VERSECRAFT_ENABLE_LANGGRAPH (default false).
 * When disabled, the existing manual pipeline in worldEngine/engine.ts
 * and dmAgentOrchestrator.ts continues to operate unchanged.
 */

import "server-only";
import { envBoolean } from "@/lib/config/envRaw";

export interface LangGraphFeatureFlags {
  /** Master switch: enable LangGraph graphs for director orchestration. */
  enabled: boolean;
  /** Enable PostgreSQL-backed checkpointing (only when enabled=true). */
  checkpointEnabled: boolean;
}

export function resolveLangGraphFlags(): LangGraphFeatureFlags {
  const enabled = envBoolean("VERSECRAFT_ENABLE_LANGGRAPH", false);
  return {
    enabled,
    checkpointEnabled: enabled && envBoolean("VERSECRAFT_ENABLE_LANGGRAPH_CHECKPOINT", true),
  };
}
