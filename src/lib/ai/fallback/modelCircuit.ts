import { resolveAiEnv } from "@/lib/ai/config/envCore";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { recordProviderFailure, recordProviderSuccess } from "@/lib/ai/fallback/circuitBreaker";
import type { AiProviderId } from "@/lib/ai/types/core";

type Bucket = { failures: number; openedUntil: number };

const modelState = new Map<string, Bucket>();

function key(role: AiLogicalRole, scopeId?: string): string {
  return scopeId ?? role;
}

function threshold(): number {
  return resolveAiEnv().circuitFailureThreshold;
}

function cooldownMs(): number {
  return resolveAiEnv().circuitCooldownMs;
}

export function isModelCircuitOpen(role: AiLogicalRole, now = Date.now(), scopeId?: string): boolean {
  const k = key(role, scopeId);
  const b = modelState.get(k);
  if (!b) return false;
  if (now >= b.openedUntil) {
    modelState.delete(k);
    return false;
  }
  return b.failures >= threshold();
}

export function recordModelSuccess(
  role: AiLogicalRole,
  provider: AiProviderId,
  opts?: { providerScope?: "online" | "offline"; serviceId?: string; modelId?: string }
): void {
  modelState.delete(key(role, opts?.modelId));
  recordProviderSuccess(provider, { scope: opts?.providerScope, circuitScopeId: opts?.serviceId });
}

export function recordModelFailure(
  role: AiLogicalRole,
  provider: AiProviderId,
  opts?: { providerScope?: "online" | "offline"; countProvider?: boolean; serviceId?: string; modelId?: string }
): void {
  const k = key(role, opts?.modelId);
  const prev = modelState.get(k) ?? { failures: 0, openedUntil: 0 };
  const failures = prev.failures + 1;
  const openedUntil =
    failures >= threshold() ? Date.now() + cooldownMs() : prev.openedUntil;
  modelState.set(k, { failures, openedUntil });
  if (opts?.countProvider !== false) {
    recordProviderFailure(provider, { scope: opts?.providerScope, circuitScopeId: opts?.serviceId });
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
