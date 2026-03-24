import { buildServiceContextForLocation, isAbsoluteSafeZoneLocation } from "@/lib/registry/runtimeBoundary";

const LOCATION_NODE_RE = /\b(B2_Passage|B2_GatekeeperDomain|B1_SafeZone|B1_Storage|B1_Laundry|B1_PowerRoom|1F_Lobby|1F_PropertyOffice|1F_GuardRoom|1F_Mailboxes|2F_Clinic201|2F_Room202|2F_Room203|2F_Corridor|3F_Room301|3F_Room302|3F_Stairwell|4F_Room401|4F_Room402|4F_CorridorEnd|5F_Room501|5F_Room502|5F_Studio503|6F_Room601|6F_Room602|6F_Stairwell|7F_Room701|7F_Bench|7F_Kitchen|7F_SealedDoor)\b/i;

export function guessPlayerLocationFromContext(playerContext: string): string | null {
  const m = playerContext.match(LOCATION_NODE_RE);
  return m?.[1] ?? null;
}

export function buildB1ServiceContextBlock(args: {
  playerLocation: string | null;
  playerContext?: string;
  serviceState?: {
    shopUnlocked?: boolean;
    forgeUnlocked?: boolean;
    anchorUnlocked?: boolean;
    unlockFlags?: Record<string, boolean>;
  };
}): string {
  const presentNpcIds = extractPresentNpcIds(args.playerContext ?? "", args.playerLocation);
  return buildServiceContextForLocation(
    args.playerLocation,
    args.serviceState ?? {},
    presentNpcIds
  );
}

function extractPresentNpcIds(playerContext: string, location: string | null): string[] {
  if (!location) return [];
  const result: string[] = [];
  const re = /\b(N-\d{3})@([A-Za-z0-9_]+)/g;
  for (const m of playerContext.matchAll(re)) {
    if ((m[2] ?? "").trim() === location) result.push((m[1] ?? "").trim());
  }
  return result;
}

export function applyB1SafetyGuard(args: {
  dmRecord: Record<string, unknown>;
  fallbackLocation: string | null;
}): Record<string, unknown> {
  const next = { ...args.dmRecord };
  const loc =
    (typeof next.player_location === "string" ? next.player_location : null) ??
    args.fallbackLocation;
  if (!isAbsoluteSafeZoneLocation(loc)) return next;
  const damage = Number(next.sanity_damage ?? 0);
  if (!Number.isFinite(damage) || damage <= 0) return next;

  next.sanity_damage = 0;
  next.is_action_legal = false;
  const meta =
    next.security_meta && typeof next.security_meta === "object" && !Array.isArray(next.security_meta)
      ? (next.security_meta as Record<string, unknown>)
      : {};
  next.security_meta = {
    ...meta,
    action: "guarded",
    stage: "b1_safe_zone_guard",
    reason: "hostile_damage_blocked_in_b1",
  };
  return next;
}
