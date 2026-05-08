import { buildActorIdentity, type ActorType } from "@/lib/analytics/actorIdentity";
import { derivePlatformFromUserAgent } from "@/lib/analytics/dateKeys";
import type { AnalyticsPlatform } from "@/lib/analytics/types";

export type GameplayEventIdentityInput = {
  sessionId?: string | null;
  guestId?: string | null;
  userAgent?: string | null;
  platform?: AnalyticsPlatform;
  eventVersion?: string;
  payload?: Record<string, unknown>;
};

export type ResolvedGameplayEventIdentity = {
  userId: string | null;
  guestId: string | null;
  actorId: string | null;
  actorType: ActorType | null;
  sessionId: string;
  platform: AnalyticsPlatform;
  payload: Record<string, unknown>;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function inferGuestIdFromSessionId(sessionId: string | null): string | null {
  if (!sessionId) return null;
  return sessionId.startsWith("guest_") ? sessionId : null;
}

function buildGuestHomeSessionId(guestId: string): string {
  const suffix = guestId.replace(/[^A-Za-z0-9_-]/g, "").slice(-24) || "unknown";
  return `home_g_${suffix}`;
}

function mergeDataQuality(
  payload: Record<string, unknown>,
  patch: Record<string, boolean>
): Record<string, unknown> {
  const existing =
    payload.dataQuality && typeof payload.dataQuality === "object" && !Array.isArray(payload.dataQuality)
      ? (payload.dataQuality as Record<string, unknown>)
      : {};
  return {
    ...payload,
    dataQuality: {
      ...existing,
      ...patch,
    },
  };
}

export function resolveGameplayEventIdentity(
  input: GameplayEventIdentityInput,
  authenticatedUserId: string | null
): ResolvedGameplayEventIdentity {
  const userId = normalizeText(authenticatedUserId);
  const explicitGuestId = normalizeText(input.guestId);
  const rawSessionId = normalizeText(input.sessionId);
  const guestId = explicitGuestId ?? (userId ? null : inferGuestIdFromSessionId(rawSessionId));
  const actor = buildActorIdentity({ userId, guestId });
  const sessionId = rawSessionId ?? (userId ? `sess_${userId}` : guestId ? buildGuestHomeSessionId(guestId) : "anon_session");
  const platform = input.platform ?? derivePlatformFromUserAgent(input.userAgent ?? null);
  let payload = { ...(input.payload ?? {}) };

  const eventVersion = normalizeText(input.eventVersion);
  if (eventVersion) {
    payload.eventVersion = eventVersion;
  }

  if (!userId && !guestId) {
    payload = mergeDataQuality(payload, { missingGuestId: true });
  }

  return {
    userId,
    guestId,
    actorId: actor?.actorId ?? null,
    actorType: actor?.actorType ?? null,
    sessionId,
    platform,
    payload,
  };
}
