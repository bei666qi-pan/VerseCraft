import {
  getDailyBgmTrackForLocation,
  inferFloorIdFromLocation,
  isDailyBgmTrack,
  resolveBgmTrackKey,
  type BgmTrackKey,
} from "@/config/audio";

type StatSnapshot = {
  sanity?: number;
};

type BgmDmRecord = {
  is_death?: boolean;
  sanity_damage?: number;
  player_location?: string;
  bgm_track?: string;
  risk_source?: string;
  damage_source?: string;
  conflict_outcome?: unknown;
  weapon_updates?: unknown[];
  weapon_bag_updates?: unknown[];
  main_threat_updates?: unknown[];
  clue_updates?: unknown[];
  codex_updates?: unknown[];
  task_updates?: unknown[];
};

export type BgmSelectionInput = {
  dm: BgmDmRecord;
  previousTrack: string | null | undefined;
  previousLocation: string | null | undefined;
  nextLocation: string | null | undefined;
  previousStats?: StatSnapshot | null;
  nextStats?: StatSnapshot | null;
  day?: number | null;
};

export type BgmSelection = {
  track: BgmTrackKey;
  reason:
    | "character_death"
    | "boss_or_endgame"
    | "combat"
    | "sanity_collapse"
    | "darkmoon_anomaly"
    | "battle_resolved"
    | "key_clue"
    | "model_event_hint"
    | "same_floor_daily"
    | "floor_daily";
};

const HOSTILE_RISK_SOURCES = new Set([
  "hostile",
  "hostile_attack",
  "anomaly_attack",
  "direct_anomaly",
  "environment_hostile",
]);

const DARKMOON_RISK_SOURCES = new Set(["direct_anomaly", "truth_shock", "environment"]);

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasConflictOutcome(value: unknown): boolean {
  return isObjectRecord(value) && Object.keys(value).length > 0;
}

function getThreatUpdates(dm: BgmDmRecord): Array<Record<string, unknown>> {
  return asArray(dm.main_threat_updates).filter(isObjectRecord);
}

function hasThreatPhase(dm: BgmDmRecord, phases: readonly string[]): boolean {
  return getThreatUpdates(dm).some((update) => phases.includes(String(update.phase ?? "")));
}

function fieldText(value: unknown): string {
  if (Array.isArray(value)) return value.map(fieldText).join(" ");
  if (isObjectRecord(value)) return Object.values(value).map(fieldText).join(" ");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function hasEndgameRevealSignal(dm: BgmDmRecord, nextLocation: string | null | undefined): boolean {
  if (inferFloorIdFromLocation(nextLocation) !== "7") return false;
  const structuredText = [
    ...asArray(dm.clue_updates),
    ...asArray(dm.codex_updates),
    ...asArray(dm.task_updates),
  ].map(fieldText).join(" ");
  return /管理员|管理人|终局|最终|真相|admin|administrator|endgame|final/i.test(structuredText);
}

function hasBossSignal(dm: BgmDmRecord, nextLocation: string | null | undefined): boolean {
  if (resolveBgmTrackKey(dm.bgm_track) === "bgm_endgame_high_pressure") return true;
  if (hasThreatPhase(dm, ["breached"])) return true;
  if (String(nextLocation ?? "") === "B2_GatekeeperDomain") {
    return hasThreatPhase(dm, ["active", "breached"]);
  }
  if (hasEndgameRevealSignal(dm, nextLocation)) return true;
  return getThreatUpdates(dm).some((update) => {
    const floorId = String(update.floorId ?? "");
    const threatId = String(update.threatId ?? "");
    const phase = String(update.phase ?? "");
    return (floorId === "B2" || threatId === "A-008") && phase === "breached";
  });
}

function hasWeaponSignal(dm: BgmDmRecord): boolean {
  return asArray(dm.weapon_updates).length > 0 || asArray(dm.weapon_bag_updates).length > 0;
}

function hasCombatSignal(dm: BgmDmRecord): boolean {
  const sanityDamage = Number(dm.sanity_damage ?? 0);
  const riskSource = String(dm.risk_source ?? dm.damage_source ?? "");
  if (hasConflictOutcome(dm.conflict_outcome)) return true;
  if (hasWeaponSignal(dm)) return true;
  if (hasThreatPhase(dm, ["active", "breached"])) return true;
  return sanityDamage > 0 && HOSTILE_RISK_SOURCES.has(riskSource);
}

function hasSanityCollapseSignal(input: BgmSelectionInput): boolean {
  const nextSanity = Number(input.nextStats?.sanity ?? NaN);
  const prevSanity = Number(input.previousStats?.sanity ?? NaN);
  const damage = Number(input.dm.sanity_damage ?? 0);
  const nextLocation = input.nextLocation ?? input.previousLocation ?? null;
  const isB1 = inferFloorIdFromLocation(nextLocation) === "B1";

  if (isB1) {
    return Number.isFinite(nextSanity) && nextSanity < 10 && damage >= 12;
  }
  if (Number.isFinite(nextSanity) && nextSanity < 20) return true;
  if (damage >= 8) return true;
  return Number.isFinite(prevSanity) && Number.isFinite(nextSanity) && prevSanity >= 20 && nextSanity < 20;
}

function hasDarkmoonAnomalySignal(input: BgmSelectionInput): boolean {
  const modelTrack = resolveBgmTrackKey(input.dm.bgm_track);
  if (modelTrack === "bgm_darkmoon_anomaly") return true;
  const source = String(input.dm.risk_source ?? input.dm.damage_source ?? "");
  if (Number(input.dm.sanity_damage ?? 0) > 0 && DARKMOON_RISK_SOURCES.has(source)) return true;
  return false;
}

function hasKeyClueSignal(dm: BgmDmRecord): boolean {
  if (asArray(dm.clue_updates).length > 0) return true;
  if (asArray(dm.codex_updates).length > 0) return true;
  return asArray(dm.task_updates).some((update) => {
    if (!isObjectRecord(update)) return false;
    const id = String(update.id ?? "");
    const status = String(update.status ?? "");
    return /escape|truth|mainline|b2|7f|clue/i.test(id) || status === "completed";
  });
}

function isEventTrack(track: BgmTrackKey): boolean {
  return !isDailyBgmTrack(track);
}

export function selectBgmForTurn(input: BgmSelectionInput): BgmSelection {
  const dm = input.dm;
  const previousTrack = resolveBgmTrackKey(input.previousTrack);
  const nextLocation = input.nextLocation ?? input.previousLocation ?? null;

  if (dm.is_death === true) {
    return { track: "bgm_character_death", reason: "character_death" };
  }

  if (hasBossSignal(dm, nextLocation)) {
    return { track: "bgm_endgame_high_pressure", reason: "boss_or_endgame" };
  }

  const combat = hasCombatSignal(dm);
  if (combat) {
    return { track: "bgm_combat_encounter", reason: "combat" };
  }

  if (hasSanityCollapseSignal(input)) {
    return { track: "bgm_sanity_collapse", reason: "sanity_collapse" };
  }

  if (hasDarkmoonAnomalySignal(input)) {
    return { track: "bgm_darkmoon_anomaly", reason: "darkmoon_anomaly" };
  }

  if (previousTrack === "bgm_combat_encounter" || previousTrack === "bgm_endgame_high_pressure") {
    return { track: "bgm_battle_resolved", reason: "battle_resolved" };
  }

  if (hasKeyClueSignal(dm)) {
    return { track: "bgm_key_clue", reason: "key_clue" };
  }

  const modelTrack = resolveBgmTrackKey(dm.bgm_track);
  if (isEventTrack(modelTrack)) {
    return { track: modelTrack, reason: "model_event_hint" };
  }

  const previousFloor = inferFloorIdFromLocation(input.previousLocation);
  const nextFloor = inferFloorIdFromLocation(nextLocation);
  if (previousFloor && previousFloor === nextFloor && isDailyBgmTrack(previousTrack)) {
    return { track: previousTrack, reason: "same_floor_daily" };
  }

  return { track: getDailyBgmTrackForLocation(nextLocation), reason: "floor_daily" };
}
