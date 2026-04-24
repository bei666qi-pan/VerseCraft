// src/lib/presence/heartbeatCore.ts
/** 8s minimum between successfully applied heartbeats (HTTP 429 if faster). */
export const PRESENCE_HEARTBEAT_MIN_INTERVAL_MS = 8000;

/** Max real-time seconds to credit per single accepted heartbeat. */
export const PRESENCE_MAX_PLAY_DELTA_SEC = 60;

/** 10s dedupe window key (align with DB bucket_start grid). */
export const PRESENCE_BUCKET_SEC = 10;

/**
 * Start of a UTC 10s bucket containing `instantMs` (ms since epoch, UTC).
 */
export function bucketStartUtcFromMs(instantMs: number): Date {
  const s = Math.floor(instantMs / 1000);
  const b = Math.floor(s / PRESENCE_BUCKET_SEC) * PRESENCE_BUCKET_SEC;
  return new Date(b * 1000);
}

/**
 * Elapsed whole seconds from last seen to now, floored, clamped to [0, 60], NaN/invalid → 0.
 * Callers should pass `lastSeen` from the session row and `now` in server clock.
 */
export function computePlayDeltaSec(
  lastSeen: Date | null | undefined,
  now: Date
): number {
  if (!lastSeen) return 0;
  const a = lastSeen.getTime();
  const b = now.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const el = Math.floor((b - a) / 1000);
  if (el < 0) return 0;
  return Math.min(el, PRESENCE_MAX_PLAY_DELTA_SEC);
}

export function shouldCountPresenceHeartbeat(args: { visible: boolean; hasFocus: boolean }): boolean {
  return args.visible && args.hasFocus;
}
