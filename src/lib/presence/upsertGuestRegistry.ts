// src/lib/presence/upsertGuestRegistry.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isPostgresUnavailableError, warnOptionalPostgresUnavailableOnce } from "@/lib/db/postgresErrors";

export type GuestRegistryMeta = {
  userAgent: string | null;
  ipHash: string | null;
  platform: string | null;
};

/**
 * One row per stable `guest_id` (first-class guest profile + privacy fields).
 * Called from guest presence / heartbeat; play seconds also roll up here.
 */
export async function upsertGuestRegistryRow(args: {
  guestId: string;
  now: Date;
  playDeltaSec: number;
  meta: GuestRegistryMeta;
}): Promise<void> {
  const gid = args.guestId.trim();
  if (!gid || gid.length > 128) return;
  const delta = Math.trunc(args.playDeltaSec);
  const d = Number.isFinite(delta) && delta > 0 ? delta : 0;
  const ua = args.meta.userAgent && args.meta.userAgent.length <= 2000 ? args.meta.userAgent : null;
  const ip = args.meta.ipHash && args.meta.ipHash.length <= 64 ? args.meta.ipHash : null;
  const pl = args.meta.platform && args.meta.platform.length <= 32 ? args.meta.platform : "unknown";
  const now = args.now;
  try {
    await db.execute(sql`
      INSERT INTO guest_registry (
        guest_id, first_seen_at, last_seen_at, total_play_duration_sec,
        ua, ip_hash, platform, updated_at
      ) VALUES (
        ${gid}, ${now}, ${now}, ${d},
        ${ua}, ${ip}, ${pl}, ${now}
      )
      ON CONFLICT (guest_id) DO UPDATE SET
        last_seen_at = ${now},
        total_play_duration_sec = guest_registry.total_play_duration_sec + ${d},
        ua = COALESCE(EXCLUDED.ua, guest_registry.ua),
        ip_hash = COALESCE(EXCLUDED.ip_hash, guest_registry.ip_hash),
        platform = COALESCE(NULLIF(EXCLUDED.platform, 'unknown'), guest_registry.platform),
        updated_at = ${now}
    `);
  } catch (e) {
    if (isPostgresUnavailableError(e)) {
      warnOptionalPostgresUnavailableOnce("guestRegistry.upsert");
      return;
    }
    console.error("[guest_registry] upsert failed", e);
  }
}
