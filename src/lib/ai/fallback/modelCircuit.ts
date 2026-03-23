import { resolveAiEnv } from "@/lib/ai/config/envCore";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { recordProviderFailure, recordProviderSuccess } from "@/lib/ai/fallback/circuitBreaker";
import type { AiProviderId } from "@/lib/ai/types/core";

type Bucket = { failures: number; openedUntil: number };

const modelState = new Map<string, Bucket>();

function key(role: AiLogicalRole): string {
  return role;
}

function threshold(): number {
  return resolveAiEnv().circuitFailureThreshold;
}

function cooldownMs(): number {
  return resolveAiEnv().circuitCooldownMs;
}

export function isModelCircuitOpen(role: AiLogicalRole, now = Date.now()): boolean {
  const b = modelState.get(key(role));
  if (!b) return false;
  if (now >= b.openedUntil) {
    modelState.delete(key(role));
    return false;
  }
  return b.failures >= threshold();
}

export function recordModelSuccess(
  role: AiLogicalRole,
  provider: AiProviderId,
  opts?: { providerScope?: "online" | "offline" }
): void {
  modelState.delete(key(role));
  recordProviderSuccess(provider, opts);
}

export function recordModelFailure(
  role: AiLogicalRole,
  provider: AiProviderId,
  opts?: { providerScope?: "online" | "offline"; countProvider?: boolean }
): void {
  const k = key(role);
  const prev = modelState.get(k) ?? { failures: 0, openedUntil: 0 };
  const failures = prev.failures + 1;
  const openedUntil =
    failures >= threshold() ? Date.now() + cooldownMs() : prev.openedUntil;
  modelState.set(k, { failures, openedUntil });
  if (opts?.countProvider !== false) {
    recordProviderFailure(provider, { scope: opts?.providerScope });
  }
}

export function snapshotModelCircuits(): Array<{ logicalRole: AiLogicalRole; failures: number; openedUntil: number }> {
  const out: Array<{ logicalRole: AiLogicalRole; failures: number; openedUntil: number }> = [];
  for (const [mid, b] of modelState.entries()) {
    out.push({ logicalRole: mid as AiLogicalRole, failures: b.failures, openedUntil: b.openedUntil });
  }
  return out;
}

/** Clears model-level circuit counters (integration tests only). */
export function resetModelCircuitsForTests(): void {
  modelState.clear();
}
