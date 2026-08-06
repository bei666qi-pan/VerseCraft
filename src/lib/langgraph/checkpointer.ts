// src/lib/langgraph/checkpointer.ts
/**
 * LangGraph checkpoint saver factory.
 *
 * Default: MemorySaver (in-process, suitable for single-worker deployments).
 * PostgreSQL-backed persistence is a follow-up (requires @langchain/langgraph-checkpoint-postgres).
 *
 * Checkpoints enable interrupt/resume for long-running World Director ticks.
 * Memory-based checkpoints are lost on process restart — suitable for
 * same-worker recovery (timeout → resume) but not cross-deployment persistence.
 */

import "server-only";
import { MemorySaver } from "@langchain/langgraph";

let _saverInstance: MemorySaver | null = null;

/**
 * Get the shared MemorySaver instance.
 * MemorySaver stores checkpoints in-process, so they survive across
 * graph invocations within the same worker but not across restarts.
 */
export function getCheckpointSaver(): MemorySaver {
  if (!_saverInstance) {
    _saverInstance = new MemorySaver();
  }
  return _saverInstance;
}

/**
 * Clean up expired checkpoints.
 * MemorySaver is bounded by the runtime heap — this is a no-op
 * but provides the same interface for future PostgreSQL migration.
 */
export async function cleanupExpiredCheckpoints(): Promise<number> {
  // MemorySaver doesn't have a TTL mechanism.
  // In the PostgreSQL-backed future version, this will DELETE rows older than 7 days.
  return 0;
}

/**
 * Reset the cached saver instance (for testing).
 */
export function resetCheckpointSaver(): void {
  _saverInstance = null;
}
