import "server-only";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { AdminTimeRange } from "@/lib/admin/timeRange";

export type ProfessionWeaponMetricsV1 = {
  professionCertificationRate: number;
  professionTrialOfferedRate: number;
  firstWeaponizationRate: number;
  weaponMaintenanceRate: number;
  weaponPollutionHighRate: number;
  earlyGuideHitRate: number;
  topApproachedProfessions: Array<{ profession: string; actors: number }>;
};

export async function getProfessionWeaponMetrics(range: AdminTimeRange): Promise<ProfessionWeaponMetricsV1> {
  /**
   * 数据源：
   * - chat_action_completed payload 里已经注入了 actor/weapon/guide 的紧凑字段（阶段6）
   * - 以 DISTINCT actor_id 为口径，避免单人刷回合污染比例
   */
  const res = await db.execute(sql`
    WITH base AS (
      SELECT
        actor_id AS actorId,
        MAX(CASE WHEN (payload->'actor'->>'professionCertified')::int = 1 THEN 1 ELSE 0 END) AS certified,
        MAX(CASE WHEN (payload->'actor'->>'professionTrialOffered')::int = 1 THEN 1 ELSE 0 END) AS trialOffered,
        MAX(CASE WHEN (payload->'weapon'->>'weaponizationAttempted')::int = 1 THEN 1 ELSE 0 END) AS weaponizeAttempted,
        MAX(CASE WHEN (payload->'weapon'->>'needsMaintenance')::int = 1 THEN 1 ELSE 0 END) AS needsMaintenance,
        MAX(CASE WHEN (payload->'weapon'->>'pollutionHigh')::int = 1 THEN 1 ELSE 0 END) AS pollutionHigh,
        MAX(CASE WHEN (payload->'guide'->>'liuSeen')::int = 1 OR (payload->'guide'->>'linzSeen')::int = 1 THEN 1 ELSE 0 END) AS guideHit,
        MAX(payload->'actor'->>'professionCurrent') AS professionCurrent
      FROM analytics_events
      WHERE event_name = 'chat_action_completed'
        AND actor_id IS NOT NULL
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY actor_id
    ),
    denom AS (
      SELECT COUNT(*)::int AS actors FROM base
    )
    SELECT
      (SELECT actors FROM denom)::int AS actorCount,
      COALESCE((SELECT COUNT(*) FROM base WHERE certified = 1), 0)::int AS certifiedActors,
      COALESCE((SELECT COUNT(*) FROM base WHERE trialOffered = 1), 0)::int AS trialOfferedActors,
      COALESCE((SELECT COUNT(*) FROM base WHERE weaponizeAttempted = 1), 0)::int AS weaponizeActors,
      COALESCE((SELECT COUNT(*) FROM base WHERE needsMaintenance = 1), 0)::int AS maintenanceActors,
      COALESCE((SELECT COUNT(*) FROM base WHERE pollutionHigh = 1), 0)::int AS pollutionHighActors,
      COALESCE((SELECT COUNT(*) FROM base WHERE guideHit = 1), 0)::int AS guideHitActors
  `);
  const row = (res as { rows?: Array<Record<string, unknown>> })?.rows?.[0] ?? {};
  const actorCount = Number(row.actorcount ?? row.actorCount ?? 0);
  const certifiedActors = Number(row.certifiedactors ?? row.certifiedActors ?? 0);
  const trialOfferedActors = Number(row.trialofferedactors ?? row.trialOfferedActors ?? 0);
  const weaponizeActors = Number(row.weaponizeactors ?? row.weaponizeActors ?? 0);
  const maintenanceActors = Number(row.maintenanceactors ?? row.maintenanceActors ?? 0);
  const pollutionHighActors = Number(row.pollutionhighactors ?? row.pollutionHighActors ?? 0);
  const guideHitActors = Number(row.guidehitactors ?? row.guideHitActors ?? 0);

  const topRes = await db.execute(sql`
    WITH base AS (
      SELECT
        actor_id AS actorId,
        MAX(payload->'actor'->>'professionCurrent') AS professionCurrent
      FROM analytics_events
      WHERE event_name = 'chat_action_completed'
        AND actor_id IS NOT NULL
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY actor_id
    )
    SELECT professionCurrent AS profession, COUNT(*)::int AS actors
    FROM base
    WHERE professionCurrent IS NOT NULL AND professionCurrent <> '' AND professionCurrent <> '无'
    GROUP BY professionCurrent
    ORDER BY COUNT(*) DESC
    LIMIT 8
  `);
  const topRows = (topRes as { rows?: Array<Record<string, unknown>> })?.rows ?? [];
  const topApproachedProfessions = topRows.map((r) => ({
    profession: String((r as any).profession ?? ""),
    actors: Number((r as any).actors ?? 0),
  })).filter((x) => x.profession);

  const safeRate = (n: number) => (actorCount > 0 ? n / actorCount : 0);
  return {
    professionCertificationRate: safeRate(certifiedActors),
    professionTrialOfferedRate: safeRate(trialOfferedActors),
    firstWeaponizationRate: safeRate(weaponizeActors),
    weaponMaintenanceRate: safeRate(maintenanceActors),
    weaponPollutionHighRate: safeRate(pollutionHighActors),
    earlyGuideHitRate: safeRate(guideHitActors),
    topApproachedProfessions,
  };
}

