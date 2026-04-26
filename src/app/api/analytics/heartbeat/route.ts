import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { derivePlatformFromUserAgent, getUtcDateKey } from "@/lib/analytics/dateKeys";
import { buildActorIdentity } from "@/lib/analytics/actorIdentity";
import { computeHeartbeatDelta } from "@/lib/analytics/sessionClock";
import { markUserActive } from "@/lib/presence";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { isPostgresUnavailableError, warnOptionalPostgresUnavailableOnce } from "@/lib/db/postgresErrors";

export const dynamic = "force-dynamic";

type HeartbeatBody = {
  sessionId: string;
  guestId?: string | null;
  page?: string | null;
  kind?: "active" | "passive";
  visibility?: "visible" | "hidden";
  userAgent?: string | null;
};

export async function POST(req: Request) {
  const rollout = getVerseCraftRolloutFlags();
  if (!rollout.enableSessionClockV1) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  let body: HeartbeatBody | null = null;
  try {
    body = (await req.json()) as HeartbeatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const sessionId = String(body?.sessionId ?? "").trim();
  const guestId = typeof body?.guestId === "string" ? body.guestId.trim() : null;
  if (!sessionId) return NextResponse.json({ ok: false, error: "missing_sessionId" }, { status: 400 });

  // 不依赖登录；游客通过 guestId 建 actor。
  const actor = buildActorIdentity({ userId: null, guestId });
  if (!actor) return NextResponse.json({ ok: false, error: "missing_actor" }, { status: 400 });

  const now = new Date();
  const nowMs = now.getTime();
  const page = typeof body?.page === "string" ? body.page : null;
  const kind = body?.kind === "active" ? "active" : "passive";
  const visibility = body?.visibility === "hidden" ? "hidden" : "visible";
  const platform = derivePlatformFromUserAgent(body?.userAgent ?? null);
  const dateKey = getUtcDateKey(now);

  // presence：用 actorId 作为 member（统一用户/游客）。
  void markUserActive(actor.actorId).catch(() => {});

  try {
    // 读 session 上次时间并累计 delta（最大缺口 120s 防爆）
    const lastRes = await db.execute(sql`
      SELECT last_seen_at
      FROM actor_sessions
      WHERE session_id = ${sessionId}
      LIMIT 1
    `);
    const lastSeenRaw = (lastRes as { rows?: Array<Record<string, unknown>> })?.rows?.[0]?.last_seen_at;
    const lastSeenAtMs = lastSeenRaw ? new Date(String(lastSeenRaw)).getTime() : null;
    const delta = computeHeartbeatDelta({ lastSeenAtMs, nowMs, kind, visibility });

    const minuteBucket = Math.floor(nowMs / 60_000);
    const eventId = `${actor.actorId}:${sessionId}:hb:${minuteBucket}`;
    const idempotencyKey = `${actor.actorId}:${sessionId}:hb:${minuteBucket}`;

    await db.execute(sql`
      WITH ins_event AS (
        INSERT INTO analytics_events (
          event_id, actor_id, actor_type, guest_id, user_id, session_id, event_name, event_time,
          page, source, platform,
          token_cost, play_duration_delta_sec,
          online_duration_delta_sec, active_play_duration_delta_sec, read_duration_delta_sec, idle_duration_delta_sec,
          payload, idempotency_key
        ) VALUES (
          ${eventId}, ${actor.actorId}, ${actor.actorType}, ${actor.guestId}, NULL, ${sessionId}, 'session_heartbeat', ${now},
          ${page}, 'heartbeat', ${platform},
          0, 0,
          ${delta.onlineSec}, ${delta.activePlaySec}, ${delta.readSec}, ${delta.idleSec},
          ${JSON.stringify({ kind, visibility })}::jsonb, ${idempotencyKey}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING event_id
      ),
      upsert_actor AS (
        INSERT INTO analytics_actors (actor_id, actor_type, user_id, guest_id, created_at, last_seen_at)
        SELECT ${actor.actorId}, ${actor.actorType}, NULL, ${actor.guestId}, ${now}, ${now}
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (actor_id) DO UPDATE SET
          guest_id = COALESCE(EXCLUDED.guest_id, analytics_actors.guest_id),
          last_seen_at = GREATEST(analytics_actors.last_seen_at, EXCLUDED.last_seen_at)
      ),
      upsert_session AS (
        INSERT INTO actor_sessions (
          session_id, actor_id, actor_type, user_id, guest_id,
          started_at, last_seen_at, last_page,
          total_token_cost, chat_action_count,
          online_sec, active_play_sec, read_sec, idle_sec, updated_at
        )
        SELECT
          ${sessionId}, ${actor.actorId}, ${actor.actorType}, NULL, ${actor.guestId},
          ${now}, ${now}, ${page},
          0, 0,
          ${delta.onlineSec}, ${delta.activePlaySec}, ${delta.readSec}, ${delta.idleSec}, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (session_id) DO UPDATE SET
          actor_id = EXCLUDED.actor_id,
          actor_type = EXCLUDED.actor_type,
          guest_id = COALESCE(EXCLUDED.guest_id, actor_sessions.guest_id),
          last_seen_at = GREATEST(actor_sessions.last_seen_at, EXCLUDED.last_seen_at),
          last_page = COALESCE(EXCLUDED.last_page, actor_sessions.last_page),
          online_sec = actor_sessions.online_sec + EXCLUDED.online_sec,
          active_play_sec = actor_sessions.active_play_sec + EXCLUDED.active_play_sec,
          read_sec = actor_sessions.read_sec + EXCLUDED.read_sec,
          idle_sec = actor_sessions.idle_sec + EXCLUDED.idle_sec,
          updated_at = CURRENT_TIMESTAMP
      ),
      upsert_daily AS (
        INSERT INTO actor_daily_activity (
          actor_id, actor_type, user_id, guest_id, date_key,
          first_active_at, last_active_at,
          session_count, chat_action_count,
          online_sec, active_play_sec, read_sec, idle_sec
        )
        SELECT
          ${actor.actorId}, ${actor.actorType}, NULL, ${actor.guestId}, ${dateKey}::date,
          ${now}, ${now},
          0, 0,
          ${delta.onlineSec}, ${delta.activePlaySec}, ${delta.readSec}, ${delta.idleSec}
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (actor_id, date_key) DO UPDATE SET
          last_active_at = GREATEST(actor_daily_activity.last_active_at, EXCLUDED.last_active_at),
          online_sec = actor_daily_activity.online_sec + EXCLUDED.online_sec,
          active_play_sec = actor_daily_activity.active_play_sec + EXCLUDED.active_play_sec,
          read_sec = actor_daily_activity.read_sec + EXCLUDED.read_sec,
          idle_sec = actor_daily_activity.idle_sec + EXCLUDED.idle_sec
      )
      SELECT 1;
    `);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      warnOptionalPostgresUnavailableOnce("api.analytics.heartbeat");
      return NextResponse.json({ ok: true, skipped: true });
    }
    // heartbeat 永不阻断体验
    console.warn("[api/analytics/heartbeat] failed", err);
  }

  return NextResponse.json({ ok: true });
}

