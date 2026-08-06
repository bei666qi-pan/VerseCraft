// src/lib/observability/langfuse/sampling.ts

import { createHash } from "node:crypto";
import { getLangfuseConfig } from "./config";

/**
 * Deterministic head sampling based on requestId.
 * Uses a simple hash-based approach: hash the requestId and compare
 * against the configured sample rate.
 *
 * The same requestId will always produce the same sampling decision,
 * enabling deterministic replay and debugging.
 *
 * @param requestId — VerseCraft request ID
 * @returns true if this request should be sampled
 */
export function shouldSample(requestId: string): boolean {
  const cfg = getLangfuseConfig();

  // Always sample if rate >= 1
  if (cfg.sampleRate >= 1) return true;

  // Never sample if rate <= 0
  if (cfg.sampleRate <= 0) return false;

  // Deterministic hash: SHA-256 of requestId, take first 8 hex chars as 32-bit int
  const hash = createHash("sha256").update(requestId).digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) % 10000;
  return bucket < cfg.sampleRate * 10000;
}
