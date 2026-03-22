// src/lib/ai/degrade/modeCore.ts
/**
 * Operation mode without `server-only` for Node unit tests. Prefer importing `mode.ts` from server code.
 */
import { envRawFirst } from "@/lib/config/envRaw";

/** Controls how aggressively we narrow model chains (player path + policy). */
export type OperationMode = "full" | "safe" | "emergency";

/**
 * - full: default chain (main role first + policy fallbacks + AI_PLAYER_ROLE_CHAIN extras).
 * - safe: primary + policy fallbacks only (no env player chain merge).
 * - emergency: main role only (max availability).
 */
export function resolveOperationMode(): OperationMode {
  const v = (envRawFirst(["AI_OPERATION_MODE", "AI_DEGRADE_MODE"]) ?? "").toLowerCase();
  if (v === "emergency" || v === "panic") return "emergency";
  if (v === "safe" || v === "degraded") return "safe";
  return "full";
}
