import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { userSessions } from "@/db/schema";
import { getOnlineUsersFromPresence } from "@/lib/presence";

export type AdminRealtimeMetrics = {
  onlineUsers: number;
  activeSessions: number;
  avgSessionDurationSec: number;
  updatedAt: string;
};

const ACTIVE_SESSION_WINDOW_MIN = 10;

export async function getAdminRealtimeMetrics(): Promise<AdminRealtimeMetrics> {
  const [{ count: onlineUsers }] = await Promise.all([
    getOnlineUsersFromPresence().catch(() => ({ ids: [], count: 0 })),
  ]);

  // Uses indexed user_sessions.last_seen_at for low-cost realtime reads.
  const [row] = await db
    .select({
      activeSessions: sql<number>`COUNT(*)::int`,
      avgSessionDurationSec: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${userSessions.lastSeenAt} - ${userSessions.startedAt}))), 0)::int`,
    })
    .from(userSessions)
    .where(sql`${userSessions.lastSeenAt} >= NOW() - (${ACTIVE_SESSION_WINDOW_MIN} * INTERVAL '1 minute')`);

  return {
    onlineUsers: Number(onlineUsers ?? 0),
    activeSessions: Number(row?.activeSessions ?? 0),
    avgSessionDurationSec: Number(row?.avgSessionDurationSec ?? 0),
    updatedAt: new Date().toISOString(),
  };
}

