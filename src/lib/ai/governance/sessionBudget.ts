// src/lib/ai/governance/sessionBudget.ts
import "server-only";

import { aiGovernanceEnv } from "@/lib/ai/governance/env";

const preflightTs = new Map<string, number[]>();
const enhanceLastAt = new Map<string, number>();
const enhanceHourly = new Map<string, number[]>();

function pruneTimestamps(arr: number[], windowMs: number): number[] {
  const now = Date.now();
  return arr.filter((t) => now - t < windowMs);
}

function sessionKey(sessionId: string | null | undefined): string {
  return (sessionId ?? "anon").slice(0, 128);
}

/** Sliding window: control-plane calls per session (abuse / cost guard). */
export function allowControlPreflightForSession(sessionId: string | null | undefined): boolean {
  const sid = sessionKey(sessionId);
  const max = Math.max(6, Math.min(120, aiGovernanceEnv.preflightMaxPerMinutePerSession));
  const windowMs = 60_000;
  const now = Date.now();
  const arr = pruneTimestamps(preflightTs.get(sid) ?? [], windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  preflightTs.set(sid, arr);
  return true;
}

/** True if cooldown + hourly cap would allow an enhancement call (does not consume). */
export function isNarrativeEnhancementBudgetAvailable(sessionId: string | null | undefined): boolean {
  const sid = sessionKey(sessionId);
  const now = Date.now();
  const cooldownMs = Math.max(30_000, aiGovernanceEnv.enhanceCooldownSec * 1000);
  const last = enhanceLastAt.get(sid) ?? 0;
  if (now - last < cooldownMs) return false;

  const hourWindow = 3_600_000;
  const hourly = pruneTimestamps(enhanceHourly.get(sid) ?? [], hourWindow);
  const cap = Math.max(1, Math.min(30, aiGovernanceEnv.enhanceMaxPerHourPerSession));
  return hourly.length < cap;
}

/** Call only when about to invoke enhancement-role upstream completion. */
export function commitNarrativeEnhancementBudget(sessionId: string | null | undefined): void {
  const sid = sessionKey(sessionId);
  const now = Date.now();
  const hourWindow = 3_600_000;
  const hourly = pruneTimestamps(enhanceHourly.get(sid) ?? [], hourWindow);
  hourly.push(now);
  enhanceHourly.set(sid, hourly);
  enhanceLastAt.set(sid, now);
}
