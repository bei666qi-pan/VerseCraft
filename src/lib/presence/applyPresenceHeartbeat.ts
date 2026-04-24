// src/lib/presence/applyPresenceHeartbeat.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bucketStartUtcFromMs,
  computePlayDeltaSec,
  PRESENCE_HEARTBEAT_MIN_INTERVAL_MS,
} from "@/lib/presence/heartbeatCore";
import { markUserActive } from "@/lib/presence";
import { recordPlayDurationToRollups } from "@/lib/presence/recordPlayDurationRollup";
import { upsertGuestRegistryRow } from "@/lib/presence/upsertGuestRegistry";
import { recordDailyActiveUser } from "@/lib/adminDailyMetrics";
import { getUtcDateKey } from "@/lib/adminDailyMetrics";

function rowsOf<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = (result as { rows?: T[] })?.rows;
  return Array.isArray(r) ? r : [];
}

export type ApplyPresenceHeartbeatInput = {
  sessionId: string;
  userId: string | null;
  guestId: string | null;
  page: string | null;
  now: Date;
  /** Fingerprinting for `guest_registry` (hashed IP; no raw IP stored). */
  client?: { userAgent: string | null; ipHash: string | null; platform: string | null } | null;
};

export type ApplyPresenceResult =
  | { kind: "ok"; playDeltaSec: number }
  | { kind: "deduped" }
  | { kind: "rate_limited" }
  | { kind: "bad_request"; message: string };

function assertSessionId(s: string): string | null {
  const t = s.trim();
  if (!t || t.length > 191) return null;
  return t;
}

export async function applyPresenceHeartbeat(input: ApplyPresenceHeartbeatInput): Promise<ApplyPresenceResult> {
  const sessionId = assertSessionId(input.sessionId);
  if (!sessionId) {
    return { kind: "bad_request", message: "invalid sessionId" };
  }

  const { userId, guestId, page, now } = input;
  if (userId) {
    // Logged-in: `guestId` in body is ignored; session is owned by `userId` from auth.
  } else {
    const g = (guestId ?? "").trim();
    if (!g || g.length > 128) {
      return { kind: "bad_request", message: "guestId required for anonymous" };
    }
  }

  const nowMs = now.getTime();
  const bucketStart = bucketStartUtcFromMs(nowMs);
  const pageSql = page && page.length <= 500 ? page : null;

  if (userId) {
    return applyForUser({ sessionId, userId, page: pageSql, now, bucketStart });
  }
  return applyForGuest({
    sessionId,
    guestId: (guestId ?? "").trim(),
    page: pageSql,
    now,
    bucketStart,
    client: input.client,
  });
}

async function applyForUser(args: {
  sessionId: string;
  userId: string;
  page: string | null;
  now: Date;
  bucketStart: Date;
}): Promise<ApplyPresenceResult> {
  const { sessionId, userId, page, now, bucketStart } = args;

  const q0 = await db.execute(sql`
    SELECT session_id, user_id, last_seen_at, last_presence_ok_at, total_play_duration_sec
    FROM user_sessions
    WHERE session_id = ${sessionId}
    LIMIT 1
  `);
  const existing = (rowsOf<Record<string, unknown>>(q0)[0] ?? null) as
    | {
        user_id: string | null;
        last_seen_at: string | Date;
        last_presence_ok_at: string | Date | null;
        total_play_duration_sec: number;
      }
    | null;

  if (existing && existing.user_id && existing.user_id !== userId) {
    return { kind: "bad_request", message: "session not owned" };
  }

  if (existing?.last_presence_ok_at) {
    const lastOk = new Date(String(existing.last_presence_ok_at));
    if (Number.isFinite(lastOk.getTime()) && now.getTime() - lastOk.getTime() < PRESENCE_HEARTBEAT_MIN_INTERVAL_MS) {
      return { kind: "rate_limited" };
    }
  }

  const insDedupUser = await db.execute(sql`
    INSERT INTO presence_heartbeat_dedupe (session_id, bucket_start, event_time)
    VALUES (${sessionId}, ${bucketStart}, ${now})
    ON CONFLICT (session_id, bucket_start) DO NOTHING
    RETURNING session_id
  `);
  if (rowsOf(insDedupUser).length === 0) {
    return { kind: "deduped" };
  }

  if (!existing) {
    await db.execute(sql`
      INSERT INTO user_sessions (
        session_id, user_id, started_at, last_seen_at, last_page,
        total_token_cost, total_play_duration_sec, chat_action_count, updated_at, last_presence_ok_at
      ) VALUES (
        ${sessionId}, ${userId}, ${now}, ${now}, ${page},
        0, 0, 0, CURRENT_TIMESTAMP, ${now}
      )
    `);
    void markUserActive(userId).catch(() => {});
    void recordDailyActiveUser(userId, getUtcDateKey(now)).catch(() => {});
    return { kind: "ok", playDeltaSec: 0 };
  }

  const lastSeen = new Date(String(existing.last_seen_at));
  const playDelta = computePlayDeltaSec(lastSeen, now);

  await db.execute(sql`
    UPDATE user_sessions
    SET
      last_seen_at = ${now},
      last_page = COALESCE(${page}, last_page),
      user_id = COALESCE(user_id, ${userId}),
      total_play_duration_sec = total_play_duration_sec + ${playDelta},
      last_presence_ok_at = ${now},
      updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ${sessionId}
  `);

  if (playDelta > 0) {
    void recordPlayDurationToRollups({ userId, playDeltaSec: playDelta, at: now }).catch(() => {});
  }
  void markUserActive(userId).catch(() => {});
  void recordDailyActiveUser(userId, getUtcDateKey(now)).catch(() => {});

  return { kind: "ok", playDeltaSec: playDelta };
}

async function applyForGuest(args: {
  sessionId: string;
  guestId: string;
  page: string | null;
  now: Date;
  bucketStart: Date;
  client: ApplyPresenceHeartbeatInput["client"];
}): Promise<ApplyPresenceResult> {
  const { sessionId, guestId, page, now, bucketStart, client } = args;

  const q0 = await db.execute(sql`
    SELECT session_id, guest_id, last_seen_at, last_presence_ok_at, total_play_duration_sec
    FROM guest_sessions
    WHERE session_id = ${sessionId}
    LIMIT 1
  `);
  const existing = (rowsOf<Record<string, unknown>>(q0)[0] ?? null) as
    | {
        guest_id: string;
        last_seen_at: string | Date;
        last_presence_ok_at: string | Date | null;
        total_play_duration_sec: number;
      }
    | null;

  if (existing && existing.guest_id !== guestId) {
    return { kind: "bad_request", message: "session guest mismatch" };
  }

  if (existing?.last_presence_ok_at) {
    const lastOk = new Date(String(existing.last_presence_ok_at));
    if (Number.isFinite(lastOk.getTime()) && now.getTime() - lastOk.getTime() < PRESENCE_HEARTBEAT_MIN_INTERVAL_MS) {
      return { kind: "rate_limited" };
    }
  }

  const insDedup2 = await db.execute(sql`
    INSERT INTO presence_heartbeat_dedupe (session_id, bucket_start, event_time)
    VALUES (${sessionId}, ${bucketStart}, ${now})
    ON CONFLICT (session_id, bucket_start) DO NOTHING
    RETURNING session_id
  `);
  if (rowsOf(insDedup2).length === 0) {
    return { kind: "deduped" };
  }

  if (!existing) {
    await db.execute(sql`
      INSERT INTO guest_sessions (
        session_id, guest_id, started_at, last_seen_at, last_page,
        total_play_duration_sec, updated_at, last_presence_ok_at
      ) VALUES (
        ${sessionId}, ${guestId}, ${now}, ${now}, ${page},
        0, CURRENT_TIMESTAMP, ${now}
      )
    `);
    void markUserActive(`g:${guestId}`).catch(() => {});
    void recordDailyActiveUser(`g:${guestId}`, getUtcDateKey(now)).catch(() => {});
    void upsertGuestRegistryRow({
      guestId,
      now,
      playDeltaSec: 0,
      meta: { userAgent: client?.userAgent ?? null, ipHash: client?.ipHash ?? null, platform: client?.platform ?? null },
    });
    return { kind: "ok", playDeltaSec: 0 };
  }

  const lastSeen = new Date(String(existing.last_seen_at));
  const playDelta = computePlayDeltaSec(lastSeen, now);

  await db.execute(sql`
    UPDATE guest_sessions
    SET
      last_seen_at = ${now},
      last_page = COALESCE(${page}, last_page),
      guest_id = ${guestId},
      total_play_duration_sec = total_play_duration_sec + ${playDelta},
      last_presence_ok_at = ${now},
      updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ${sessionId}
  `);

  if (playDelta > 0) {
    void recordPlayDurationToRollups({ userId: null, guestId, playDeltaSec: playDelta, at: now }).catch(() => {});
  }
  void markUserActive(`g:${guestId}`).catch(() => {});
  void recordDailyActiveUser(`g:${guestId}`, getUtcDateKey(now)).catch(() => {});
  void upsertGuestRegistryRow({
    guestId,
    now,
    playDeltaSec: playDelta,
    meta: { userAgent: client?.userAgent ?? null, ipHash: client?.ipHash ?? null, platform: client?.platform ?? null },
  });

  return { kind: "ok", playDeltaSec: playDelta };
}
