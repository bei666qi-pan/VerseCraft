// src/lib/ai/errors/classify.ts
/**
 * Normalized failure taxonomy for routing, circuit breaking, and observability.
 */
import type { AiFailureKind, AiFailureSeverity } from "@/lib/ai/types/routingErrors";

export type { AiFailureKind, AiFailureSeverity } from "@/lib/ai/types/routingErrors";

export function classifyHttpStatus(status: number): { kind: AiFailureKind; severity: AiFailureSeverity } {
  if (status === 429) return { kind: "RATE_LIMIT", severity: "hard" };
  if (status === 408) return { kind: "TIMEOUT", severity: "hard" };
  if (status >= 500 && status < 600) return { kind: "UPSTREAM_5XX", severity: "hard" };
  if (status === 401 || status === 403) return { kind: "HTTP_4XX_AUTH", severity: "hard" };
  if (status >= 400 && status < 500) return { kind: "HTTP_4XX_OTHER", severity: "hard" };
  return { kind: "UNKNOWN", severity: "soft" };
}

export function classifyFetchThrowable(error: unknown): { kind: AiFailureKind; severity: AiFailureSeverity } {
  if (error instanceof Error) {
    if (error.name === "AbortError") return { kind: "ABORTED", severity: "hard" };
    const m = error.message.toLowerCase();
    if (/abort|timeout|timed out/i.test(m)) return { kind: "TIMEOUT", severity: "hard" };
    if (/network|fetch failed|econnreset|enotfound|socket/i.test(m)) return { kind: "NETWORK", severity: "hard" };
  }
  return { kind: "UNKNOWN", severity: "hard" };
}

/** Whether this failure should increment provider/model circuit counters. */
export function shouldCountTowardCircuit(kind: AiFailureKind): boolean {
  return (
    kind === "RATE_LIMIT" ||
    kind === "UPSTREAM_5XX" ||
    kind === "TIMEOUT" ||
    kind === "NETWORK" ||
    kind === "HTTP_4XX_AUTH"
  );
}

export type AiFailureScope = "online" | "offline";

/** Offline tasks can be isolated from provider-level circuit to protect /api/chat. */
export function shouldCountTowardProviderCircuit(
  kind: AiFailureKind,
  scope: AiFailureScope,
  offlineAffectsProviderCircuit: boolean
): boolean {
  if (!shouldCountTowardCircuit(kind)) return false;
  if (scope === "offline" && !offlineAffectsProviderCircuit) return false;
  return true;
}

/** Whether we should try the next model in chain (not a client abort). */
export function shouldAdvanceToNextModel(kind: AiFailureKind): boolean {
  return kind !== "ABORTED";
}
