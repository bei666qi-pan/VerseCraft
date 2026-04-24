// src/lib/presence/mergeOnlineActorKeys.ts
/**
 * Merges Redis + DB "who is online" actor keys (user id string for registered, `g:{guestId}` for guests).
 * - `redisIds`: from ZSET when Redis succeeded; `null` when Redis unavailable (do not treat as "empty").
 * - `dbUserIds` / `dbGuestKeys` must match the same id scheme as admin (`g:{guestId}` for guests).
 */
export type MergedOnlineBreakdown = {
  merged: string[];
  inRedis: Set<string>;
  inDb: Set<string>;
  both: number;
  redisOnly: number;
  dbOnly: number;
  /** Redis client was unavailable; merged is DB-only and dbOnly must not be used for "flaky" metrics. */
  redisDown: boolean;
};

export function mergeOnlineActorKeys(
  redisIds: string[] | null,
  dbUserIds: string[],
  dbGuestKeys: string[]
): MergedOnlineBreakdown {
  const inDb = new Set([...dbUserIds, ...dbGuestKeys].filter((x) => x && x.length > 0));
  const redisDown = redisIds === null;
  const inRedis = new Set(redisDown ? [] : (redisIds ?? []).filter((x) => x && x.length > 0));

  const merged = new Set<string>([...inDb, ...inRedis]);
  const mergedList = [...merged].sort((a, b) => a.localeCompare(b));

  let both = 0;
  let redisOnly = 0;
  let dbOnly = 0;
  for (const m of merged) {
    const r = inRedis.has(m);
    const d = inDb.has(m);
    if (r && d) both += 1;
    else if (r && !d) redisOnly += 1;
    else if (!r && d) {
      if (!redisDown) dbOnly += 1;
    }
  }

  return { merged: mergedList, inRedis, inDb, both, redisOnly, dbOnly, redisDown };
}
