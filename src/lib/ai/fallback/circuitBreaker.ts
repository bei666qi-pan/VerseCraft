// src/lib/ai/fallback/circuitBreaker.ts
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import type { AiProviderId } from "@/lib/ai/types";

type Bucket = { failures: number; openedUntil: number };

const state = new Map<string, Bucket>();

function key(provider: AiProviderId, scopeId?: string): string {
  return scopeId ? `${provider}:${scopeId}` : provider;
}

export function isCircuitOpen(provider: AiProviderId, now = Date.now(), scopeId?: string): boolean {
  const k = key(provider, scopeId);
  const b = state.get(k);
  if (!b) return false;
  if (now >= b.openedUntil) {
    state.delete(k);
    return false;
  }
  return b.failures >= resolveAiEnv().circuitFailureThreshold;
}

export function recordProviderSuccess(
  provider: AiProviderId,
  opts?: { scope?: "online" | "offline"; circuitScopeId?: string }
): void {
  void opts;
  state.delete(key(provider, opts?.circuitScopeId));
}

export function recordProviderFailure(
  provider: AiProviderId,
  opts?: { scope?: "online" | "offline"; circuitScopeId?: string }
): void {
  void opts;
  const env = resolveAiEnv();
  const k = key(provider, opts?.circuitScopeId);
  const prev = state.get(k) ?? { failures: 0, openedUntil: 0 };
  const failures = prev.failures + 1;
  const openedUntil =
    failures >= env.circuitFailureThreshold ? Date.now() + env.circuitCooldownMs : prev.openedUntil;
  state.set(k, { failures, openedUntil });
}

/** Clears provider-level circuit counters (integration tests only). */
export function resetProviderCircuitsForTests(): void {
  state.clear();
}
