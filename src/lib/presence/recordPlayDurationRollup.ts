// src/lib/presence/recordPlayDurationRollup.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getUtcDateKey, recordDailyTokenUsage } from "@/lib/adminDailyMetrics";
import { isPostgresUnavailableError, warnOptionalPostgresUnavailableOnce } from "@/lib/db/postgresErrors";
import { upsertActorDailyTokensFromPlayDelta } from "@/lib/presence/actorRollupUpsert";

/**
 * Adds wall-clock play seconds to rollups. Always UTC `dateKey` (YYYY-MM-DD).
 * T8 方案B（2026-07，下线旧表）：日汇总统一写 `actor_daily_tokens`（不再区分
 * `user_daily_tokens`/`guest_daily_tokens`），加上 `admin_metrics_daily` + Redis daily play hash。
 */
export async function recordPlayDurationToRollups(args: {
  userId: string | null;
  guestId?: string | null;
  playDeltaSec: number;
  at?: Date;
}): Promise<void> {
  const d = args.at ?? new Date();
  const delta = Math.trunc(args.playDeltaSec);
  if (!Number.isFinite(delta) || delta <= 0) return;
  const dateKey = getUtcDateKey(d);
  const gid = (args.guestId ?? "").trim();

  void recordDailyTokenUsage(dateKey, 0, delta).catch(() => {});
  void upsertActorDailyTokensFromPlayDelta({ userId: args.userId, guestId: gid || null, playDeltaSec: delta, at: d });

  try {
    await db.execute(sql`
      INSERT INTO admin_metrics_daily (
        date_key, dau, wau, mau, new_users,
        total_token_cost, total_play_duration_sec, chat_actions,
        feedback_submitted_count, game_completed_count, updated_at
      ) VALUES (
        ${dateKey}::date, 0, 0, 0, 0, 0, ${delta}, 0, 0, 0, CURRENT_TIMESTAMP
      )
      ON CONFLICT (date_key) DO UPDATE SET
        total_play_duration_sec = admin_metrics_daily.total_play_duration_sec + EXCLUDED.total_play_duration_sec,
        updated_at = CURRENT_TIMESTAMP
    `);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      warnOptionalPostgresUnavailableOnce("presence.recordPlayDurationToRollups");
      return;
    }
    console.error("[presence] recordPlayDurationToRollups failed", err);
  }
}
