// src/lib/ai/fallback/circuitBreaker.ts
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import type { AiProviderId } from "@/lib/ai/types";

type Bucket = { failures: number; openedUntil: number };

const state = new Map<string, Bucket>();

function key(provider: AiProviderId): string {
  return provider;
}

export function isCircuitOpen(provider: AiProviderId, now = Date.now()): boolean {
  const b = state.get(key(provider));
  if (!b) return false;
  if (now >= b.openedUntil) {
    state.delete(key(provider));
    return false;
  }
  return b.failures >= resolveAiEnv().circuitFailureThreshold;
}

export function recordProviderSuccess(
  provider: AiProviderId,
  _opts?: { scope?: "online" | "offline" }
): void {
  state.delete(key(provider));
}

export function recordProviderFailure(
  provider: AiProviderId,
  _opts?: { scope?: "online" | "offline" }
): void {
  const env = resolveAiEnv();
  const k = key(provider);
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
