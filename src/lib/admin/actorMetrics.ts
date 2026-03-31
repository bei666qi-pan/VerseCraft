import "server-only";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { AdminTimeRange } from "@/lib/admin/timeRange";

export type ActorAdvancedMetricsV1 = {
  guestReturnRate: number;
  actorSessionCount: number;
  avgOnlineSec: number;
  avgActivePlaySec: number;
  guestCohortSize: number;
  actorCohortSize: number;
};

export async function getActorAdvancedMetrics(range: AdminTimeRange): Promise<ActorAdvancedMetricsV1> {
  // cohort：范围内首次出现的 actor（含游客/用户）
  const cohortRes = await db.execute(sql`
    WITH cohort AS (
      SELECT actor_id AS actorId, actor_type AS actorType, MIN(date_key) AS firstDay
      FROM actor_daily_activity
      WHERE date_key >= ${range.startDateKey}::date AND date_key <= ${range.endDateKey}::date
      GROUP BY actor_id, actor_type
    ),
    guest_cohort AS (
      SELECT actorId FROM cohort WHERE actorType = 'guest'
    ),
    guest_return AS (
      SELECT c.actorId
      FROM guest_cohort c
      WHERE EXISTS (
        SELECT 1
        FROM actor_daily_activity a
        WHERE a.actor_id = c.actorId
          AND a.date_key >= ${range.startDateKey}::date
          AND a.date_key <= ${range.endDateKey}::date
        GROUP BY a.actor_id
        HAVING COUNT(DISTINCT a.date_key) >= 2
      )
    ),
    sess AS (
      SELECT
        COUNT(*)::int AS sessionCount,
        COALESCE(AVG(online_sec), 0)::int AS avgOnlineSec,
        COALESCE(AVG(active_play_sec), 0)::int AS avgActivePlaySec
      FROM actor_sessions
      WHERE last_seen_at >= ${range.start} AND last_seen_at <= ${range.end}
    )
    SELECT
      (SELECT COUNT(*) FROM guest_cohort)::int AS guestCohortSize,
      (SELECT COUNT(*) FROM cohort)::int AS actorCohortSize,
      (SELECT COUNT(*) FROM guest_return)::int AS guestReturnCount,
      (SELECT sessionCount FROM sess)::int AS actorSessionCount,
      (SELECT avgOnlineSec FROM sess)::int AS avgOnlineSec,
      (SELECT avgActivePlaySec FROM sess)::int AS avgActivePlaySec
  `);
  const row = (cohortRes as { rows?: Array<Record<string, unknown>> })?.rows?.[0] ?? {};
  const guestCohortSize = Number(row.guestcohortsize ?? row.guestCohortSize ?? 0);
  const actorCohortSize = Number(row.actorcohortsize ?? row.actorCohortSize ?? 0);
  const guestReturnCount = Number(row.guestreturncount ?? row.guestReturnCount ?? 0);
  const actorSessionCount = Number(row.actorsessioncount ?? row.actorSessionCount ?? 0);
  const avgOnlineSec = Number(row.avgonlinesec ?? row.avgOnlineSec ?? 0);
  const avgActivePlaySec = Number(row.avgactiveplaysec ?? row.avgActivePlaySec ?? 0);
  const guestReturnRate = guestCohortSize > 0 ? guestReturnCount / guestCohortSize : 0;

  return {
    guestReturnRate,
    actorSessionCount,
    avgOnlineSec,
    avgActivePlaySec,
    guestCohortSize,
    actorCohortSize,
  };
}

