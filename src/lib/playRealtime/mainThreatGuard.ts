import { ANOMALIES } from "@/lib/registry/anomalies";
import { guessPlayerLocationFromContext } from "./b1Safety";

type DmRecord = Record<string, unknown>;
type ThreatPhase = "idle" | "active" | "suppressed" | "breached";

type MainThreatUpdate = {
  floorId: string;
  threatId: string;
  phase: ThreatPhase;
  suppressionProgress: number;
  lastResolvedAtHour?: number;
  counterHintsUsed?: string[];
};

function inferFloorIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  if (location.startsWith("B2_")) return "B2";
  if (location.startsWith("B1_")) return "B1";
  const m = location.match(/^(\d)F_/);
  return m?.[1] ?? null;
}

function normalizePhase(v: unknown, fallback: ThreatPhase): ThreatPhase {
  return v === "idle" || v === "active" || v === "suppressed" || v === "breached" ? v : fallback;
}

function threatIdForFloor(floorId: string): string | null {
  const hit = ANOMALIES.find((x) => x.floor === floorId);
  return hit?.id ?? null;
}

function sanitizeMainThreatUpdate(raw: unknown, fallbackFloorId: string | null, sanityDamage: number): MainThreatUpdate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const floorId = typeof row.floorId === "string" && row.floorId ? row.floorId : fallbackFloorId;
  if (!floorId) return null;
  const mappedThreatId = threatIdForFloor(floorId);
  if (!mappedThreatId) return null;
  const threatId = typeof row.threatId === "string" && row.threatId ? row.threatId : mappedThreatId;
  if (threatId !== mappedThreatId) {
    // Enforce floor-threat canonical mapping.
    return null;
  }
  const defaultPhase: ThreatPhase = floorId === "B1" ? "idle" : sanityDamage > 0 ? "breached" : "active";
  const phase = normalizePhase(row.phase, defaultPhase);
  const suppressionProgress =
    typeof row.suppressionProgress === "number" && Number.isFinite(row.suppressionProgress)
      ? Math.max(0, Math.min(100, Math.trunc(row.suppressionProgress)))
      : phase === "suppressed"
        ? 100
        : phase === "breached"
          ? 0
          : 10;
  const out: MainThreatUpdate = {
    floorId,
    threatId,
    phase,
    suppressionProgress,
  };
  if (typeof row.lastResolvedAtHour === "number" && Number.isFinite(row.lastResolvedAtHour)) {
    out.lastResolvedAtHour = Math.trunc(row.lastResolvedAtHour);
  }
  if (Array.isArray(row.counterHintsUsed)) {
    out.counterHintsUsed = row.counterHintsUsed.filter((x): x is string => typeof x === "string");
  }
  return out;
}

export function applyMainThreatUpdateGuard(args: {
  dmRecord: DmRecord;
  playerContext: string;
}): DmRecord {
  const next = { ...args.dmRecord };
  const location =
    (typeof next.player_location === "string" ? next.player_location : null) ??
    guessPlayerLocationFromContext(args.playerContext);
  const floorId = inferFloorIdFromLocation(location);
  const sanityDamage = Number(next.sanity_damage ?? 0);

  const raw = Array.isArray(next.main_threat_updates) ? next.main_threat_updates : [];
  const sanitized = raw
    .map((x) => sanitizeMainThreatUpdate(x, floorId, sanityDamage))
    .filter((x): x is MainThreatUpdate => !!x);

  if (sanitized.length > 0) {
    next.main_threat_updates = sanitized;
    return next;
  }

  // Fallback: infer a minimal update from current floor if model omitted updates.
  if (!floorId) {
    next.main_threat_updates = [];
    return next;
  }
  const mappedThreatId = threatIdForFloor(floorId);
  if (!mappedThreatId) {
    next.main_threat_updates = [];
    return next;
  }
  next.main_threat_updates = [
    {
      floorId,
      threatId: mappedThreatId,
      phase: floorId === "B1" ? "idle" : sanityDamage > 0 ? "breached" : "active",
      suppressionProgress: floorId === "B1" ? 0 : sanityDamage > 0 ? 0 : 10,
    } satisfies MainThreatUpdate,
  ];
  return next;
}

