import type { Item, NpcRelationStateV2, StatType, WarehouseItem, Weapon } from "@/lib/registry/types";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";

export const RUN_SNAPSHOT_V2_VERSION = 2 as const;

export interface SnapshotPlayerProfile {
  name: string;
  gender: string;
  height: number;
  personality: string;
}

export interface SnapshotCodexEntry {
  id: string;
  name: string;
  type: "npc" | "anomaly";
  favorability?: number;
  trust?: number;
  fear?: number;
  debt?: number;
  affection?: number;
  desire?: number;
  romanceEligible?: boolean;
  romanceStage?: "none" | "hint" | "bonded" | "committed";
  betrayalFlags?: string[];
  combatPower?: number;
  combatPowerDisplay?: string;
  personality?: string;
  traits?: string;
  rules_discovered?: string;
  weakness?: string;
}

export type SnapshotTask = GameTaskV2;

export interface SnapshotNpcState {
  currentLocation: string;
  alive: boolean;
  favorability: number;
  relationshipState: NpcRelationStateV2;
  inventoryHeld: string[];
  taskState: string;
  discoveredByPlayer: boolean;
}

export interface SnapshotMeta {
  runId: string;
  worldVersion: number;
  startedAt: string;
  lastSavedAt: string;
}

export interface SnapshotPlayer {
  profile: SnapshotPlayerProfile;
  stats: Record<StatType, number>;
  originium: number;
  inventory: Item[];
  warehouse: WarehouseItem[];
  codex: Record<string, SnapshotCodexEntry>;
  currentLocation: string;
  alive: boolean;
  deathCount: number;
  equippedWeapon: Weapon | null;
}

export interface SnapshotTime {
  day: number;
  hour: number;
  darkMoonStarted: boolean;
}

export interface SnapshotWorld {
  worldFlags: Record<string, boolean>;
  discoveredSecrets: string[];
  anchorUnlocks: Record<"B1" | "1" | "7", boolean>;
  pendingEvents: string[];
  floorThreatTier: Record<string, number>;
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
}

export type SnapshotMainThreatPhase = "idle" | "active" | "suppressed" | "breached";

export interface SnapshotMainThreatState {
  threatId: string;
  floorId: string;
  phase: SnapshotMainThreatPhase;
  suppressionProgress: number;
  lastResolvedAtHour: number | null;
  counterHintsUsed: string[];
}

export interface SnapshotTasks {
  active: SnapshotTask[];
  completed: SnapshotTask[];
  failed: SnapshotTask[];
  hidden: SnapshotTask[];
  available: SnapshotTask[];
}

export interface SnapshotDeath {
  lastDeathLocation: string | null;
  lastDeathCause: string | null;
  reviveOffered: boolean;
  reviveConsumed: boolean;
  droppedLootLedger: string[];
}

export interface SnapshotServiceState {
  shopUnlocked: boolean;
  forgeUnlocked: boolean;
  anchorUnlocked: boolean;
  unlockFlags: Record<string, boolean>;
}

export interface SnapshotCompatibility {
  legacyVersion: number;
  source: "snapshot_v2" | "legacy_migrated";
  migrationNotes: string[];
}

export interface RunSnapshotV2 {
  schemaVersion: typeof RUN_SNAPSHOT_V2_VERSION;
  meta: SnapshotMeta;
  player: SnapshotPlayer;
  time: SnapshotTime;
  world: SnapshotWorld;
  npcs: Record<string, SnapshotNpcState>;
  tasks: SnapshotTasks;
  death: SnapshotDeath;
  services: SnapshotServiceState;
  compatibility: SnapshotCompatibility;
}

/**
 * Legacy payload surface read from saveSlots.data.
 * Keep it intentionally partial to prevent hard crashes on old saves.
 */
export interface LegacySaveSurface {
  stats?: Record<StatType, number>;
  inventory?: Item[];
  warehouse?: WarehouseItem[];
  codex?: Record<string, SnapshotCodexEntry>;
  logs?: { role: string; content: string; reasoning?: string }[];
  time?: { day: number; hour: number };
  originium?: number;
  tasks?: SnapshotTask[];
  playerLocation?: string;
  dynamicNpcStates?: Record<string, { currentLocation: string; isAlive: boolean }>;
  playerName?: string;
  gender?: string;
  height?: number;
  personality?: string;
  equippedWeapon?: Weapon | null;
  runSnapshotV2?: RunSnapshotV2;
}
