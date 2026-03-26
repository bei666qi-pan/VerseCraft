import type { Item, StatType, WarehouseItem } from "@/lib/registry/types";
import type { Weapon } from "@/lib/registry/types";
import type { SaveSlotMeta } from "./branch";
import { createDefaultAnchorUnlocks } from "./anchors";
import { createDefaultDeathState } from "./death";
import { buildNpcSnapshotMap } from "./npcs";
import { splitTasksByStatus } from "./tasks";
import {
  RUN_SNAPSHOT_V2_VERSION,
  type SnapshotMainThreatState,
  type RunSnapshotV2,
  type SnapshotCodexEntry,
  type SnapshotTask,
} from "./types";
import { createDefaultProfessionState } from "@/lib/profession/registry";
import type { ProfessionStateV1 } from "@/lib/profession/types";

export interface BuildRunSnapshotV2Input {
  runId?: string;
  startedAt?: string;
  slotMeta?: SaveSlotMeta | null;
  player: {
    name: string;
    gender: string;
    height: number;
    personality: string;
  };
  stats: Record<StatType, number>;
  originium: number;
  inventory: Item[];
  warehouse: WarehouseItem[];
  codex: Record<string, SnapshotCodexEntry>;
  currentLocation: string;
  alive: boolean;
  deathCount?: number;
  equippedWeapon?: Weapon | null;
  weaponBag?: Weapon[];
  day: number;
  hour: number;
  worldFlags?: Record<string, boolean>;
  discoveredSecrets?: string[];
  anchorUnlocks?: Record<"B1" | "1" | "7", boolean>;
  pendingEvents?: string[];
  floorThreatTier?: Record<string, number>;
  mainThreatByFloor?: Record<string, SnapshotMainThreatState>;
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
  homeSeed: Record<string, string>;
  tasks: SnapshotTask[];
  profession?: ProfessionStateV1;
}

export function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildRunSnapshotV2(input: BuildRunSnapshotV2Input): RunSnapshotV2 {
  const nowIso = new Date().toISOString();
  return {
    schemaVersion: RUN_SNAPSHOT_V2_VERSION,
    meta: {
      runId: input.runId ?? createRunId(),
      worldVersion: RUN_SNAPSHOT_V2_VERSION,
      startedAt: input.startedAt ?? nowIso,
      lastSavedAt: nowIso,
      ...(input.slotMeta
        ? {
            branchMeta: {
              slotId: input.slotMeta.slotId,
              label: input.slotMeta.label,
              kind: input.slotMeta.kind,
              parentSlotId: input.slotMeta.parentSlotId,
              branchFromDecisionId: input.slotMeta.branchFromDecisionId,
              createdAt: input.slotMeta.createdAt,
            },
          }
        : {}),
    },
    player: {
      profile: {
        name: input.player.name ?? "",
        gender: input.player.gender ?? "",
        height: Number.isFinite(input.player.height) ? input.player.height : 170,
        personality: input.player.personality ?? "",
      },
      stats: { ...input.stats },
      originium: Math.max(0, Number(input.originium ?? 0)),
      inventory: [...(input.inventory ?? [])],
      warehouse: [...(input.warehouse ?? [])],
      codex: { ...(input.codex ?? {}) },
      currentLocation: input.currentLocation ?? "B1_SafeZone",
      alive: input.alive !== false,
      deathCount: Math.max(0, Number(input.deathCount ?? 0)),
      equippedWeapon: input.equippedWeapon ?? null,
      weaponBag: Array.isArray(input.weaponBag)
        ? input.weaponBag.filter((w): w is Weapon => !!w && typeof w === "object" && !Array.isArray(w))
        : [],
    },
    time: {
      day: Math.max(0, Number(input.day ?? 0)),
      hour: Math.max(0, Math.min(23, Number(input.hour ?? 0))),
      darkMoonStarted: Number(input.day ?? 0) >= 3,
    },
    world: {
      worldFlags: { ...(input.worldFlags ?? {}) },
      discoveredSecrets: [...(input.discoveredSecrets ?? [])],
      anchorUnlocks: { ...(input.anchorUnlocks ?? createDefaultAnchorUnlocks()) },
      pendingEvents: [...(input.pendingEvents ?? [])],
      floorThreatTier: { ...(input.floorThreatTier ?? {}) },
      mainThreatByFloor: { ...(input.mainThreatByFloor ?? {}) },
    },
    npcs: buildNpcSnapshotMap({
      dynamicNpcStates: input.dynamicNpcStates ?? {},
      homeSeed: input.homeSeed ?? {},
      codex: input.codex ?? {},
    }),
    tasks: splitTasksByStatus(input.tasks ?? []),
    death: createDefaultDeathState(),
    services: {
      shopUnlocked: false,
      forgeUnlocked: false,
      anchorUnlocked: true,
      unlockFlags: {},
    },
    profession: input.profession ?? createDefaultProfessionState(),
    compatibility: {
      legacyVersion: 1,
      source: "snapshot_v2",
      migrationNotes: [],
    },
  };
}
