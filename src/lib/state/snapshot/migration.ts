import type { StatType } from "@/lib/registry/types";
import { createDefaultAnchorUnlocks, normalizeAnchorUnlocks } from "./anchors";
import { normalizeDeathState } from "./death";
import { buildRunSnapshotV2, createRunId } from "./builder";
import { flattenTasks } from "./tasks";
import { normalizeGameTaskDraft } from "@/lib/tasks/taskV2";
import type {
  LegacySaveSurface,
  RunSnapshotV2,
  SnapshotCodexEntry,
  SnapshotMainThreatState,
  SnapshotTask,
} from "./types";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { inferSaveSlotKind } from "./branch";
import { createDefaultProfessionState } from "@/lib/profession/registry";

const DEFAULT_STATS: Record<StatType, number> = {
  sanity: 10,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function normalizeCodex(v: unknown): Record<string, SnapshotCodexEntry> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, SnapshotCodexEntry>;
}

function normalizeTasks(v: unknown): SnapshotTask[] {
  if (!Array.isArray(v)) return [];
  return v.map((t) => normalizeGameTaskDraft(t)).filter((t): t is SnapshotTask => !!t);
}

function normalizeMainThreatByFloor(v: unknown): Record<string, SnapshotMainThreatState> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, SnapshotMainThreatState> = {};
  for (const [floorId, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const phaseRaw = typeof row.phase === "string" ? row.phase : "idle";
    const phase =
      phaseRaw === "idle" || phaseRaw === "active" || phaseRaw === "suppressed" || phaseRaw === "breached"
        ? phaseRaw
        : "idle";
    out[floorId] = {
      threatId: typeof row.threatId === "string" ? row.threatId : "",
      floorId,
      phase,
      suppressionProgress: Math.max(0, Math.min(100, Number(row.suppressionProgress ?? 0) || 0)),
      lastResolvedAtHour:
        typeof row.lastResolvedAtHour === "number" && Number.isFinite(row.lastResolvedAtHour)
          ? Math.trunc(row.lastResolvedAtHour)
          : null,
      counterHintsUsed: Array.isArray(row.counterHintsUsed)
        ? row.counterHintsUsed.filter((x): x is string => typeof x === "string")
        : [],
    };
  }
  return out;
}

export function migrateLegacySaveToSnapshot(legacy: LegacySaveSurface): RunSnapshotV2 {
  return buildRunSnapshotV2({
    runId: createRunId(),
    player: {
      name: legacy.playerName ?? "",
      gender: legacy.gender ?? "",
      height: Number.isFinite(legacy.height) ? legacy.height : 170,
      personality: legacy.personality ?? "",
    },
    stats: legacy.stats ?? DEFAULT_STATS,
    originium: legacy.originium ?? 0,
    inventory: legacy.inventory ?? [],
    warehouse: legacy.warehouse ?? [],
    codex: normalizeCodex(legacy.codex),
    currentLocation: legacy.playerLocation ?? "B1_SafeZone",
    alive: (legacy.stats?.sanity ?? DEFAULT_STATS.sanity) > 0,
    equippedWeapon: legacy.equippedWeapon ?? null,
    weaponBag: (legacy as LegacySaveSurface & { weaponBag?: unknown }).weaponBag as any,
    day: legacy.time?.day ?? 0,
    hour: legacy.time?.hour ?? 0,
    dynamicNpcStates: legacy.dynamicNpcStates ?? {},
    homeSeed: {},
    tasks: normalizeTasks(legacy.tasks),
    profession: legacy.professionState ?? createDefaultProfessionState(),
  });
}

export function normalizeRunSnapshotV2(
  input: unknown,
  fallbackLegacy?: LegacySaveSurface
): RunSnapshotV2 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return migrateLegacySaveToSnapshot(fallbackLegacy ?? {});
  }
  const s = input as RunSnapshotV2;
  const legacyBase = fallbackLegacy ?? {};
  const fromLegacy = migrateLegacySaveToSnapshot(legacyBase);
  const normalized: RunSnapshotV2 = {
    ...fromLegacy,
    ...s,
    meta: {
      ...fromLegacy.meta,
      ...asRecord(s.meta),
      runId:
        typeof s.meta?.runId === "string" && s.meta.runId
          ? s.meta.runId
          : fromLegacy.meta.runId,
      worldVersion:
        typeof s.meta?.worldVersion === "number"
          ? s.meta.worldVersion
          : fromLegacy.meta.worldVersion,
      startedAt:
        typeof s.meta?.startedAt === "string" && s.meta.startedAt
          ? s.meta.startedAt
          : fromLegacy.meta.startedAt,
      lastSavedAt: new Date().toISOString(),
      branchMeta: (() => {
        const raw = s.meta?.branchMeta;
        const slotId =
          raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.slotId === "string" && raw.slotId
            ? raw.slotId
            : "main_slot";
        const kind =
          raw && typeof raw === "object" && !Array.isArray(raw) && (raw.kind === "main" || raw.kind === "branch" || raw.kind === "auto_branch")
            ? raw.kind
            : inferSaveSlotKind(slotId);
        return {
          slotId,
          label:
            raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.label === "string" && raw.label
              ? raw.label
              : "主线存档",
          kind,
          parentSlotId:
            raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.parentSlotId === "string" && raw.parentSlotId
              ? raw.parentSlotId
              : null,
          branchFromDecisionId:
            raw &&
            typeof raw === "object" &&
            !Array.isArray(raw) &&
            typeof raw.branchFromDecisionId === "string" &&
            raw.branchFromDecisionId
              ? raw.branchFromDecisionId
              : null,
          createdAt:
            raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.createdAt === "string" && raw.createdAt
              ? raw.createdAt
              : fromLegacy.meta.startedAt,
        };
      })(),
    },
    player: {
      ...fromLegacy.player,
      ...asRecord(s.player),
      profile: {
        ...fromLegacy.player.profile,
        ...asRecord(s.player?.profile),
      },
      stats: { ...fromLegacy.player.stats, ...asRecord(s.player?.stats) } as Record<
        StatType,
        number
      >,
      codex: normalizeCodex(s.player?.codex),
      equippedWeapon:
        s.player?.equippedWeapon && typeof s.player.equippedWeapon === "object" && !Array.isArray(s.player.equippedWeapon)
          ? (s.player.equippedWeapon as RunSnapshotV2["player"]["equippedWeapon"])
          : null,
      weaponBag: Array.isArray((s.player as unknown as { weaponBag?: unknown }).weaponBag)
        ? ((s.player as unknown as { weaponBag?: unknown }).weaponBag as unknown[])
            .filter((w): w is RunSnapshotV2["player"]["equippedWeapon"] => !!w && typeof w === "object" && !Array.isArray(w))
            .slice(0, 24)
        : [],
    },
    time: {
      ...fromLegacy.time,
      ...asRecord(s.time),
      day: Math.max(0, Number(s.time?.day ?? fromLegacy.time.day)),
      hour: Math.max(0, Math.min(23, Number(s.time?.hour ?? fromLegacy.time.hour))),
      darkMoonStarted:
        typeof s.time?.darkMoonStarted === "boolean"
          ? s.time.darkMoonStarted
          : Number(s.time?.day ?? fromLegacy.time.day) >= 3,
    },
    world: {
      ...fromLegacy.world,
      ...asRecord(s.world),
      worldFlags: asRecord(s.world?.worldFlags) as Record<string, boolean>,
      discoveredSecrets: Array.isArray(s.world?.discoveredSecrets)
        ? s.world.discoveredSecrets.filter((x): x is string => typeof x === "string")
        : fromLegacy.world.discoveredSecrets,
      anchorUnlocks: normalizeAnchorUnlocks(s.world?.anchorUnlocks),
      pendingEvents: Array.isArray(s.world?.pendingEvents)
        ? s.world.pendingEvents.filter((x): x is string => typeof x === "string")
        : fromLegacy.world.pendingEvents,
      floorThreatTier: asRecord(s.world?.floorThreatTier) as Record<string, number>,
      mainThreatByFloor: (() => {
        const parsed = normalizeMainThreatByFloor(s.world?.mainThreatByFloor);
        return Object.keys(parsed).length > 0 ? parsed : createDefaultMainThreatByFloor();
      })(),
    },
    npcs: asRecord(s.npcs) as RunSnapshotV2["npcs"],
    tasks: {
      active: normalizeTasks(s.tasks?.active),
      completed: normalizeTasks(s.tasks?.completed),
      failed: normalizeTasks(s.tasks?.failed),
      hidden: normalizeTasks(s.tasks?.hidden),
      available: normalizeTasks(s.tasks?.available),
    },
    death: normalizeDeathState(s.death),
    services: {
      shopUnlocked: Boolean(s.services?.shopUnlocked),
      forgeUnlocked: Boolean(s.services?.forgeUnlocked),
      anchorUnlocked:
        typeof s.services?.anchorUnlocked === "boolean"
          ? s.services.anchorUnlocked
          : true,
      unlockFlags: asRecord(s.services?.unlockFlags) as Record<string, boolean>,
    },
    profession: (() => {
      const raw = s.profession;
      const base = createDefaultProfessionState();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
      const o = raw as Record<string, unknown>;
      const currentProfession =
        o.currentProfession === "守灯人" ||
        o.currentProfession === "巡迹客" ||
        o.currentProfession === "觅兆者" ||
        o.currentProfession === "齐日角" ||
        o.currentProfession === "溯源师"
          ? o.currentProfession
          : null;
      const unlockedProfessions = Array.isArray(o.unlockedProfessions)
        ? o.unlockedProfessions.filter(
            (x): x is "守灯人" | "巡迹客" | "觅兆者" | "齐日角" | "溯源师" =>
              x === "守灯人" || x === "巡迹客" || x === "觅兆者" || x === "齐日角" || x === "溯源师"
          )
        : [];
      return {
        ...base,
        ...(typeof o === "object" ? (o as typeof base) : {}),
        currentProfession,
        unlockedProfessions,
      };
    })(),
    compatibility: {
      legacyVersion:
        typeof s.compatibility?.legacyVersion === "number"
          ? s.compatibility.legacyVersion
          : 1,
      source:
        s.compatibility?.source === "legacy_migrated"
          ? "legacy_migrated"
          : "snapshot_v2",
      migrationNotes: Array.isArray(s.compatibility?.migrationNotes)
        ? s.compatibility.migrationNotes.filter((x): x is string => typeof x === "string")
        : [],
    },
  };
  return normalized;
}

export function projectSnapshotToLegacy(snapshot: RunSnapshotV2): LegacySaveSurface {
  return {
    stats: snapshot.player.stats,
    inventory: snapshot.player.inventory,
    warehouse: snapshot.player.warehouse,
    codex: snapshot.player.codex,
    time: { day: snapshot.time.day, hour: snapshot.time.hour },
    originium: snapshot.player.originium,
    tasks: flattenTasks(snapshot.tasks),
    playerLocation: snapshot.player.currentLocation,
    dynamicNpcStates: Object.fromEntries(
      Object.entries(snapshot.npcs ?? {}).map(([id, v]) => [
        id,
        { currentLocation: v.currentLocation, isAlive: v.alive },
      ])
    ),
    playerName: snapshot.player.profile.name,
    gender: snapshot.player.profile.gender,
    height: snapshot.player.profile.height,
    personality: snapshot.player.profile.personality,
    equippedWeapon: snapshot.player.equippedWeapon,
    weaponBag: snapshot.player.weaponBag ?? [],
    professionState: snapshot.profession,
    runSnapshotV2: snapshot,
  };
}

export function createDefaultWorldFlags(): Record<string, boolean> {
  return {
    darkMoonActive: false,
    anchorSystemInitialized: false,
    b1HubServicesEnabled: false,
  };
}

export function createDefaultFloorThreatTier(): Record<string, number> {
  return {
    B1: 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    B2: 9,
  };
}

export function createDefaultMainThreatByFloor(): Record<string, SnapshotMainThreatState> {
  const out: Record<string, SnapshotMainThreatState> = {};
  for (const anomaly of ANOMALIES) {
    out[anomaly.floor] = {
      threatId: anomaly.id,
      floorId: anomaly.floor,
      phase: "idle",
      suppressionProgress: 0,
      lastResolvedAtHour: null,
      counterHintsUsed: [],
    };
  }
  return out;
}

export function createDefaultWorldOverlay(): {
  worldFlags: Record<string, boolean>;
  discoveredSecrets: string[];
  anchorUnlocks: Record<"B1" | "1" | "7", boolean>;
  pendingEvents: string[];
  floorThreatTier: Record<string, number>;
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
} {
  return {
    worldFlags: createDefaultWorldFlags(),
    discoveredSecrets: [],
    anchorUnlocks: createDefaultAnchorUnlocks(),
    pendingEvents: [],
    floorThreatTier: createDefaultFloorThreatTier(),
    mainThreatByFloor: createDefaultMainThreatByFloor(),
  };
}
