"use server";

import { createHash } from "node:crypto";
import { auth } from "../../../auth";
import { markUserActive } from "@/lib/presence";
import { derivePlatformFromUserAgent } from "@/lib/analytics/dateKeys";
import { recordGenericAnalyticsEvent, touchUserSessionHeartbeat } from "@/lib/analytics/repository";
import type { AnalyticsEventName } from "@/lib/analytics/types";

export async function pingPresence(sessionId?: string, page?: string, userAgent?: string | null) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false };
  }

  await markUserActive(userId);
  const sid = sessionId && sessionId.trim().length > 0 ? sessionId : `hb_${userId}`;
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60_000);
  void recordGenericAnalyticsEvent({
    eventId: `${userId}:session_heartbeat:${minuteBucket}`,
    idempotencyKey: `${userId}:session_heartbeat:${minuteBucket}`,
    userId,
    sessionId: sid,
    eventName: "session_heartbeat",
    eventTime: new Date(now),
    page: page ?? null,
    source: "heartbeat",
    platform: derivePlatformFromUserAgent(userAgent),
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {},
  }).catch(() => {});
  void touchUserSessionHeartbeat({
    sessionId: sid,
    userId,
    page: page ?? null,
  }).catch(() => {});

  return { ok: true };
}

export async function trackGameplayEvent(input: {
  eventName: AnalyticsEventName;
  sessionId?: string;
  page?: string | null;
  source?: string | null;
  tokenCost?: number;
  playDurationDeltaSec?: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<{ ok: boolean }> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const eventName = input.eventName;
  if (!eventName) return { ok: false };

  const sid = input.sessionId && input.sessionId.trim().length > 0 ? input.sessionId : userId ? `sess_${userId}` : "anon_session";
  const eventTime = new Date();
  const payload = input.payload ?? {};
  const idempotencyKey =
    input.idempotencyKey && input.idempotencyKey.trim().length > 0
      ? input.idempotencyKey
      : createHash("sha256")
          .update(
            JSON.stringify({
              eventName,
              userId,
              sid,
              page: input.page ?? null,
              source: input.source ?? null,
              payload,
              t: Math.floor(eventTime.getTime() / 1000),
            })
          )
          .digest("hex")
          .slice(0, 32);

  void recordGenericAnalyticsEvent({
    eventId: `evt_${eventTime.getTime()}_${idempotencyKey.slice(0, 8)}`,
    idempotencyKey: `${eventName}:${idempotencyKey}`,
    userId,
    sessionId: sid,
    eventName,
    eventTime,
    page: input.page ?? null,
    source: input.source ?? "client",
    platform: derivePlatformFromUserAgent(null),
    tokenCost: Math.max(0, Math.trunc(input.tokenCost ?? 0)),
    playDurationDeltaSec: Math.max(0, Math.trunc(input.playDurationDeltaSec ?? 0)),
    payload,
  }).catch(() => {});

  if (userId) {
    void touchUserSessionHeartbeat({
      sessionId: sid,
      userId,
      page: input.page ?? null,
      eventTime,
    }).catch(() => {});
  }

  return { ok: true };
}

