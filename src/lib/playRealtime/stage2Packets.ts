import { ANOMALIES } from "@/lib/registry/anomalies";
import { LIGHT_FORGE_RECIPES } from "@/lib/registry/forge";
import { getServicesForLocation } from "@/lib/registry/serviceNodes";

type MainThreatPhase = "idle" | "active" | "suppressed" | "breached";

export type ThreatSnapshot = {
  floorId: string | null;
  threatId: string | null;
  threatName: string | null;
  phase: MainThreatPhase;
  suppressionProgress: number;
};

export type ThreatContextMap = Record<string, {
  threatId: string;
  phase: MainThreatPhase;
  suppressionProgress: number;
}>;

export type WeaponSnapshot = {
  weaponId: string | null;
  stability: number | null;
  counterTags: string[];
  mods: string[];
  infusions: string[];
  contamination: number | null;
  repairable: boolean | null;
};

export function inferFloorIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  if (location.startsWith("B2_")) return "B2";
  if (location.startsWith("B1_")) return "B1";
  const m = location.match(/^(\d)F_/);
  return m?.[1] ?? null;
}

export function inferMainThreatState(location: string | null): ThreatSnapshot {
  const floorId = inferFloorIdFromLocation(location);
  if (!floorId) return { floorId: null, threatId: null, threatName: null, phase: "idle", suppressionProgress: 0 };
  const anomaly = ANOMALIES.find((x) => x.floor === floorId);
  if (!anomaly) return { floorId, threatId: null, threatName: null, phase: "idle", suppressionProgress: 0 };
  const phase: MainThreatPhase = location?.startsWith("B1_") ? "idle" : "active";
  return {
    floorId,
    threatId: anomaly.id,
    threatName: anomaly.name,
    phase,
    suppressionProgress: phase === "idle" ? 0 : 10,
  };
}

export function inferFloorThreatTier(location: string | null): "b1_safe" | "low" | "mid" | "high" | "extreme" {
  if (!location) return "low";
  if (location.startsWith("B1_")) return "b1_safe";
  if (location.startsWith("1F_")) return "low";
  if (location.startsWith("2F_") || location.startsWith("3F_")) return "mid";
  if (location.startsWith("4F_") || location.startsWith("5F_")) return "high";
  if (location.startsWith("6F_") || location.startsWith("7F_") || location.startsWith("B2_")) return "extreme";
  return "low";
}

export function buildThreatPacket(args: {
  location: string | null;
  contextThreatMap: ThreatContextMap;
}) {
  const inferred = inferMainThreatState(args.location);
  const fromContext = inferred.floorId ? args.contextThreatMap[inferred.floorId] : undefined;
  const phase = fromContext?.phase ?? inferred.phase;
  return {
    floorId: inferred.floorId,
    activeThreatId: fromContext?.threatId ?? inferred.threatId,
    activeThreatName: inferred.threatName,
    phase,
    suppressionProgress: fromContext?.suppressionProgress ?? inferred.suppressionProgress,
    counterHint: phase === "active" ? "优先匹配主威胁弱点标签进行压制。" : null,
  };
}

export function buildWeaponPacket(args: {
  weapon: WeaponSnapshot;
  threatName: string | null;
  threatId: string | null;
}) {
  const w = args.weapon;
  return {
    equippedWeaponId: w.weaponId,
    stability: w.stability,
    counterTags: w.counterTags,
    mods: w.mods,
    infusions: w.infusions,
    contamination: w.contamination,
    repairable: w.repairable,
    matchAgainstMainThreat:
      Boolean(w.weaponId) &&
      Boolean(args.threatId) &&
      w.counterTags.length > 0 &&
      Boolean(args.threatName)
        ? w.counterTags.some((t) => String(args.threatName).toLowerCase().includes(t.toLowerCase()))
        : false,
  };
}

export function buildForgePacket(args: {
  location: string | null;
  serviceState?: {
    shopUnlocked?: boolean;
    forgeUnlocked?: boolean;
    anchorUnlocked?: boolean;
    unlockFlags?: Record<string, boolean>;
  };
  contextThreatPhase: MainThreatPhase;
}) {
  const services = getServicesForLocation(args.location, args.serviceState ?? {});
  const forgeAvailable =
    args.location === "B1_PowerRoom" &&
    services.some((svc) => (svc.kind === "forge_upgrade" || svc.kind === "forge_repair") && svc.available);
  return {
    availableAtCurrentLocation: forgeAvailable,
    operations: ["repair", "mod", "infuse"],
    availableMods: LIGHT_FORGE_RECIPES.filter((x) => x.operation === "mod").map((x) => x.id),
    availableInfusions: LIGHT_FORGE_RECIPES.filter((x) => x.operation === "infuse").map((x) => x.id),
    recommendation:
      args.contextThreatPhase === "active"
        ? "上楼前优先做针对主威胁的改装/灌注。"
        : "稳定度或污染偏差时优先修复。",
  };
}

export function buildFloorProgressionPacket(args: {
  location: string | null;
  worldFlags: string[];
  recentEvents: string[];
  discoveredTruths: string[];
}) {
  return {
    location: args.location,
    floorThreatTier: inferFloorThreatTier(args.location),
    worldFlags: args.worldFlags.slice(0, 12),
    recentEvents: args.recentEvents.slice(0, 6),
    discoveredTruths: args.discoveredTruths.slice(0, 6),
  };
}

export function buildTacticalContextPacket(args: {
  latestUserInput: string;
  activeTasks: string[];
  runtimeLoreHints: string[];
  nearbyNpcIds: string[];
  threatPhase?: MainThreatPhase;
}) {
  const text = String(args.latestUserInput ?? "");
  const requiredWritebacks = new Set<string>();
  if (
    text.includes("锻造") ||
    text.includes("修复") ||
    text.includes("改装") ||
    text.includes("灌注") ||
    text.toLowerCase().includes("forge")
  ) {
    requiredWritebacks.add("weapon_updates");
  }
  if (
    text.includes("压制") ||
    text.includes("突破") ||
    text.includes("威胁") ||
    args.threatPhase === "active" ||
    args.threatPhase === "suppressed" ||
    args.threatPhase === "breached"
  ) {
    requiredWritebacks.add("main_threat_updates");
  }
  if (text.includes("任务") || text.includes("委托") || text.includes("目标")) {
    requiredWritebacks.add("task_updates");
  }
  return {
    latestUserInput: args.latestUserInput.slice(0, 200),
    activeTasks: args.activeTasks.slice(0, 6),
    nearbyNpcIds: args.nearbyNpcIds.slice(0, 8),
    runtimeLoreHints: args.runtimeLoreHints.slice(0, 8),
    nextTurnFocus: [
      "威胁状态推进需同步 main_threat_updates",
      "武器/锻造变化需同步 weapon_updates",
      "叙事变化要与状态回写一致",
    ],
    requiredWritebacks: [...requiredWritebacks],
  };
}

