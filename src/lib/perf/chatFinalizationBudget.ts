import { CHAT_LATENCY_BUDGET } from "./waitingConfig";

/** Time reserved for guards, output moderation and writing the authoritative FINAL frame. */
export const CHAT_FINALIZATION_RESERVE_MS = 2_500;

/**
 * Extra headroom for host/event-loop scheduling jitter before the stream timer
 * callback can run. Live evidence has shown a 17.5s timer resume about 3.7s
 * late during a host stall; without a separate reserve the protocol fallback
 * itself arrives after the public 20s final budget.
 */
export const CHAT_STREAM_TIMER_JITTER_RESERVE_MS = 2_500;

/** Deliver the watchdog fallback before an eval/client sharing the 20s target aborts. */
export const CHAT_WATCHDOG_DELIVERY_RESERVE_MS = 1_000;

/**
 * Bound provider stream consumption early enough to leave deterministic
 * guards, fallback serialization and the authoritative FINAL write inside the
 * normal-turn p95 budget. This is an absolute request-level allowance: stream
 * reconnects must share it rather than receiving a fresh allowance.
 */
export function resolveChatStreamHardCapMs(configuredMs: number): number {
  // The public 20s budget is a target for the complete turn, not permission
  // for the provider stream alone to occupy all 20 seconds. Values at or below
  // that target therefore keep the finalization and timer-jitter reserves.
  // Operators may still make an explicit tradeoff for a slower Responses
  // provider by setting a value above the public budget.
  const latestSafeMs = Math.max(
    1_000,
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms
      - CHAT_FINALIZATION_RESERVE_MS
      - CHAT_STREAM_TIMER_JITTER_RESERVE_MS,
  );
  const requestedMs = Number.isFinite(configuredMs) ? Math.trunc(configuredMs) : latestSafeMs;
  if (requestedMs <= 0) return latestSafeMs;
  if (requestedMs <= CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms) {
    return Math.max(1_000, Math.min(latestSafeMs, requestedMs));
  }
  return Math.max(1_000, requestedMs);
}

/**
 * A p50 target is not a cancellation boundary. Keep silence bounded by the
 * public p95 final budget; the earlier request watchdog still reserves time
 * to emit a deterministic FINAL if the provider never resumes.
 */
export function resolveChatStreamIdleTimeoutMs(configuredMs: number): number {
  const requestedMs = Number.isFinite(configuredMs)
    ? Math.trunc(configuredMs)
    : CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms;
  return Math.max(1_000, Math.min(CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms, requestedMs));
}

export function resolveChatTurnWatchdogMs(configuredMs: number): number {
  const latestSafeMs = Math.max(
    1_000,
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms - CHAT_WATCHDOG_DELIVERY_RESERVE_MS,
  );
  const requestedMs = Number.isFinite(configuredMs) ? Math.trunc(configuredMs) : latestSafeMs;
  if (requestedMs <= 0) return latestSafeMs;
  // Responses providers can legitimately exceed the interactive p95 before
  // producing their first token. An explicit production override must remain
  // effective; otherwise the watchdog races a successful upstream response
  // and commits a no-op fallback for a paid player action.
  if (requestedMs <= CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms) {
    return Math.max(1_000, Math.min(latestSafeMs, requestedMs));
  }
  return Math.max(1_000, requestedMs);
}

export function resolveOptionalEnhanceBudgetMs(args: {
  configuredMs: number;
  elapsedMs: number;
}): number {
  const configuredMs = Math.max(0, Math.trunc(args.configuredMs));
  if (configuredMs === 0) return 0;
  const remainingMs = Math.max(
    0,
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms - Math.max(0, Math.trunc(args.elapsedMs)),
  );
  if (remainingMs < configuredMs + CHAT_FINALIZATION_RESERVE_MS) return 0;
  return Math.min(configuredMs, remainingMs - CHAT_FINALIZATION_RESERVE_MS);
}
