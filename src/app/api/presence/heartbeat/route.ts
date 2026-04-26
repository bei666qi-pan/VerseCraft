// src/app/api/presence/heartbeat/route.ts
import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { ensureRuntimeSchema } from "@/db/ensureSchema";
import { applyPresenceHeartbeat } from "@/lib/presence/applyPresenceHeartbeat";
import { shouldCountPresenceHeartbeat } from "@/lib/presence/heartbeatCore";
import { hashClientIpForGuest, platformFromUserAgent } from "@/lib/privacy/guestIdentityHash";
import { isPostgresUnavailableError, warnOptionalPostgresUnavailableOnce } from "@/lib/db/postgresErrors";

export const dynamic = "force-dynamic";

type HeartbeatJson = {
  sessionId?: string;
  guestId?: string | null;
  page?: string | null;
  context?: { visible?: boolean; focused?: boolean } | null;
  beacon?: boolean;
};

function parseJsonBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function getRequestIp(request: Request): string | null {
  const h = request.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0]?.trim() ?? null;
  }
  return h.get("x-real-ip")?.trim() ?? null;
}

export async function POST(request: Request) {
  await ensureRuntimeSchema().catch((e) => {
    if (isPostgresUnavailableError(e)) {
      warnOptionalPostgresUnavailableOnce("api.presence.ensureRuntimeSchema");
      return;
    }
    console.warn("[api/presence/heartbeat] ensureRuntimeSchema", e);
  });

  const ct = request.headers.get("content-type") ?? "";
  let raw: unknown;
  if (ct.includes("application/json")) {
    raw = await request.json().catch(() => ({}));
  } else {
    const t = await request.text();
    raw = t ? parseJsonBody(t) : {};
  }

  const b = (raw ?? {}) as HeartbeatJson;
  const userAgent = request.headers.get("user-agent");
  const ipHash = hashClientIpForGuest(getRequestIp(request));
  const client = {
    userAgent: userAgent && userAgent.length <= 2000 ? userAgent : null,
    ipHash,
    platform: platformFromUserAgent(userAgent),
  };

  const guestInBody = typeof b.guestId === "string" ? b.guestId.trim() : b.guestId === null ? null : "";
  let sessionId = String(b.sessionId ?? "").trim();
  if (!sessionId && guestInBody) {
    sessionId = `g_sess_${guestInBody.slice(0, 120)}`;
  }
  if (!sessionId) {
    return NextResponse.json({ error: "missing sessionId" }, { status: 400 });
  }

  const page = typeof b.page === "string" ? b.page : null;
  const ctx = b.context;
  if (ctx) {
    const v = ctx.visible !== false;
    const f = ctx.focused !== false;
    if (!shouldCountPresenceHeartbeat({ visible: v, hasFocus: f })) {
      return NextResponse.json({ ok: true, ignored: true });
    }
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const guestIdForBody =
    userId ? null : guestInBody && guestInBody.length > 0 ? guestInBody : null;

  const now = new Date();
  let res: Awaited<ReturnType<typeof applyPresenceHeartbeat>>;
  try {
    res = await applyPresenceHeartbeat({
      sessionId,
      userId,
      guestId: guestIdForBody,
      page,
      now,
      client,
    });
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      warnOptionalPostgresUnavailableOnce("api.presence.heartbeat");
      return NextResponse.json({ ok: true, skipped: true });
    }
    throw err;
  }

  if (res.kind === "bad_request") {
    return NextResponse.json({ error: res.message }, { status: 400 });
  }
  if (res.kind === "rate_limited") {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (res.kind === "deduped") {
    return NextResponse.json({ ok: true, deduped: true });
  }
  return NextResponse.json({ ok: true, playDeltaSec: res.playDeltaSec });
}
