// src/lib/ai/fallback/modelCircuit.ts
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import type { AllowedModelId } from "@/lib/ai/models/registry";
import { recordProviderFailure, recordProviderSuccess } from "@/lib/ai/fallback/circuitBreaker";
import type { AiProviderId } from "@/lib/ai/types/core";

type Bucket = { failures: number; openedUntil: number };

const modelState = new Map<string, Bucket>();

function key(modelId: AllowedModelId): string {
  return modelId;
}

function threshold(): number {
  return resolveAiEnv().circuitFailureThreshold;
}

function cooldownMs(): number {
  return resolveAiEnv().circuitCooldownMs;
}

export function isModelCircuitOpen(modelId: AllowedModelId, now = Date.now()): boolean {
  const b = modelState.get(key(modelId));
  if (!b) return false;
  if (now >= b.openedUntil) {
    modelState.delete(key(modelId));
    return false;
  }
  return b.failures >= threshold();
}

export function recordModelSuccess(modelId: AllowedModelId, provider: AiProviderId): void {
  modelState.delete(key(modelId));
  recordProviderSuccess(provider);
}

export function recordModelFailure(modelId: AllowedModelId, provider: AiProviderId): void {
  const k = key(modelId);
  const prev = modelState.get(k) ?? { failures: 0, openedUntil: 0 };
  const failures = prev.failures + 1;
  const openedUntil =
    failures >= threshold() ? Date.now() + cooldownMs() : prev.openedUntil;
  modelState.set(k, { failures, openedUntil });
  recordProviderFailure(provider);
}

export function snapshotModelCircuits(): Array<{ modelId: AllowedModelId; failures: number; openedUntil: number }> {
  const out: Array<{ modelId: AllowedModelId; failures: number; openedUntil: number }> = [];
  for (const [mid, b] of modelState.entries()) {
    out.push({ modelId: mid as AllowedModelId, failures: b.failures, openedUntil: b.openedUntil });
  }
  return out;
}

/** Clears model-level circuit counters (integration tests only). */
export function resetModelCircuitsForTests(): void {
  modelState.clear();
}
