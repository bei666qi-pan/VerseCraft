// src/lib/presence/onlineWindow.ts
/**
 * One definition of "online" for both Redis / DB and admin realtime.
 * ~2x default presence heartbeat (30s) + jitter; keep in sync with `usePresenceHeartbeat` interval.
 */
export const ONLINE_WINDOW_SECONDS = 90;

export const ONLINE_WINDOW_MS = ONLINE_WINDOW_SECONDS * 1000;

/**
 * `lastSeen` and `now` are absolute instants; comparison is in UTC (timestamptz in DB, epoch ms in Redis).
 * Online iff elapsed wall time from last seen is strictly within [0, window) — same predicate as
 * `last_seen_at >= (cutoff)`.
 */
export function isWithinOnlineWindow(
  lastSeenMs: number,
  nowMs: number,
  windowSec: number = ONLINE_WINDOW_SECONDS
): boolean {
  if (!Number.isFinite(lastSeenMs) || !Number.isFinite(nowMs) || !Number.isFinite(windowSec)) {
    return false;
  }
  const elapsedMs = nowMs - lastSeenMs;
  if (elapsedMs < 0) return false;
  return elapsedMs <= windowSec * 1000;
}
