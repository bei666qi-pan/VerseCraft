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
  SnapshotTask,
} from "./types";

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
    day: legacy.time?.day ?? 0,
    hour: legacy.time?.hour ?? 0,
    dynamicNpcStates: legacy.dynamicNpcStates ?? {},
    homeSeed: {},
    tasks: normalizeTasks(legacy.tasks),
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

export function createDefaultWorldOverlay(): {
  worldFlags: Record<string, boolean>;
  discoveredSecrets: string[];
  anchorUnlocks: Record<"B1" | "1" | "7", boolean>;
  pendingEvents: string[];
  floorThreatTier: Record<string, number>;
} {
  return {
    worldFlags: createDefaultWorldFlags(),
    discoveredSecrets: [],
    anchorUnlocks: createDefaultAnchorUnlocks(),
    pendingEvents: [],
    floorThreatTier: createDefaultFloorThreatTier(),
  };
}
