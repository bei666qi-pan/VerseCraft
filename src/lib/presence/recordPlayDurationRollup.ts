// src/lib/presence/recordPlayDurationRollup.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getUtcDateKey, recordDailyTokenUsage } from "@/lib/adminDailyMetrics";
import { isPostgresUnavailableError, warnOptionalPostgresUnavailableOnce } from "@/lib/db/postgresErrors";

/**
 * Adds wall-clock play seconds to rollups. Always UTC `dateKey` (YYYY-MM-DD).
 * Registered users: `user_daily_tokens` + `admin_metrics_daily` + Redis daily play hash.
 * Guests: `guest_daily_tokens` + `admin_metrics_daily` (no `user_daily_*` row).
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

  try {
    if (args.userId) {
      await db.execute(sql`
        INSERT INTO user_daily_tokens (
          user_id, date_key, daily_token_cost, daily_play_duration_sec, chat_action_count
        ) VALUES (
          ${args.userId}, ${dateKey}::date, 0, ${delta}, 0
        )
        ON CONFLICT (user_id, date_key) DO UPDATE SET
          daily_play_duration_sec = user_daily_tokens.daily_play_duration_sec + EXCLUDED.daily_play_duration_sec
      `);
    } else if (gid) {
      await db.execute(sql`
        INSERT INTO guest_daily_tokens (
          guest_id, date_key, daily_token_cost, daily_play_duration_sec, chat_action_count
        ) VALUES (
          ${gid}, ${dateKey}::date, 0, ${delta}, 0
        )
        ON CONFLICT (guest_id, date_key) DO UPDATE SET
          daily_play_duration_sec = guest_daily_tokens.daily_play_duration_sec + EXCLUDED.daily_play_duration_sec
      `);
    }

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
