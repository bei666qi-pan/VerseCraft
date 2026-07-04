import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { actorSessions } from "@/db/schema";
import { getOnlinePresenceReport } from "@/lib/presence";
import { ONLINE_WINDOW_SECONDS } from "@/lib/presence/onlineWindow";

export type AdminRealtimeMetrics = {
  onlineUsers: number;
  /** Active guest **sessions** (rows in `actor_sessions`, actor_type='guest') within the online window. */
  onlineGuests: number;
  /** `COUNT(*)` from `actor_sessions` (actor_type='user') with `last_seen_at` in the online window (indexed). */
  activeSessions: number;
  avgSessionDurationSec: number;
  updatedAt: string;
  /** Dev-only: how online actors were merged (Redis vs DB vs overlap). */
  presenceDebug?: {
    redis: number;
    db: number;
    both: number;
    dbOnly: number;
    redisOnly: number;
    redisDown: boolean;
  };
};

export async function getAdminRealtimeMetrics(): Promise<AdminRealtimeMetrics> {
  const win = ONLINE_WINDOW_SECONDS;
  const report = await getOnlinePresenceReport();
  const { mergedBreakdown, onlineUsersRegistered, onlineGuestSessionCount, activeUserSessionsCount } = report;

  // T8 方案B：平均会话时长已从 `user_sessions` 切到统一的 `actor_sessions`（actor_type = 'user'）。
  const [avgRow] = await db
    .select({
      avgSessionDurationSec: sql<number>`COALESCE(
        AVG(EXTRACT(EPOCH FROM (${actorSessions.lastSeenAt} - ${actorSessions.startedAt}))),
        0
      )::int`,
    })
    .from(actorSessions)
    .where(
      sql`${actorSessions.actorType} = 'user' AND ${actorSessions.lastSeenAt} >= (NOW() - (${win}::int * interval '1 second'))`
    );

  const isDev = process.env.NODE_ENV === "development";

  return {
    onlineUsers: onlineUsersRegistered,
    onlineGuests: onlineGuestSessionCount,
    activeSessions: activeUserSessionsCount,
    avgSessionDurationSec: Number(avgRow?.avgSessionDurationSec ?? 0),
    updatedAt: new Date().toISOString(),
    presenceDebug: isDev
      ? {
          redis: mergedBreakdown.inRedis.size,
          db: mergedBreakdown.inDb.size,
          both: mergedBreakdown.both,
          dbOnly: mergedBreakdown.dbOnly,
          redisOnly: mergedBreakdown.redisOnly,
          redisDown: mergedBreakdown.redisDown,
        }
      : undefined,
  };
}
