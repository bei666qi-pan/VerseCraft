import { isAbsoluteSafeZoneLocation } from "@/lib/registry/serviceNodes";
import { mapAnchorUnlocksToEnabledAnchors } from "@/lib/revive/anchorRegistry";
import type { SnapshotMainThreatState } from "./types";

export type SaveSlotKind = "main" | "branch" | "auto_branch";

export interface SaveSlotSnapshotSummary {
  day: number;
  hour: number;
  playerLocation: string;
  floorScore: number;
  activeProfession: string | null;
  activeTasksCount: number;
  keyThreatStates: string[];
  keyNpcFlags: string[];
  revivePending: boolean;
  recentDeathSummary: string | null;
}

export interface SaveSlotMeta {
  slotId: string;
  label: string;
  kind: SaveSlotKind;
  createdAt: string;
  updatedAt: string;
  runId: string;
  parentSlotId: string | null;
  branchFromDecisionId: string | null;
  snapshotSummary: SaveSlotSnapshotSummary;
}

export interface BranchCreateGuardInput {
  playerLocation: string;
  revivePending: boolean;
  isAlive: boolean;
  anchorUnlocks: Record<"B1" | "1" | "7", boolean>;
  currentFloorThreat: SnapshotMainThreatState | null;
}

export interface BranchCreateGuardResult {
  ok: boolean;
  reason: string | null;
}

export function resolveFloorScore(loc: string): number {
  if (!loc) return 0;
  if (loc.startsWith("B2_")) return 8;
  if (loc.startsWith("B1_")) return 0;
  const m = loc.match(/^(\d)F_/);
  return m ? Number(m[1] ?? 0) : 0;
}

export function inferSaveSlotKind(slotId: string): SaveSlotKind {
  if (slotId === "main_slot") return "main";
  if (slotId.startsWith("auto_branch_")) return "auto_branch";
  if (slotId.startsWith("branch_")) return "branch";
  return "main";
}

export function createBranchSlotId(existingIds: string[]): string {
  for (let i = 1; i <= 3; i += 1) {
    const id = `branch_${i}`;
    if (!existingIds.includes(id)) return id;
  }
  return `branch_${Date.now()}`;
}

export function createAutoSlotIdFor(slotId: string): string {
  if (slotId === "main_slot") return "auto_main";
  if (slotId.startsWith("branch_")) return `auto_${slotId}`;
  return `auto_${slotId}`;
}

export function buildSnapshotSummary(input: {
  day: number;
  hour: number;
  playerLocation: string;
  activeTasksCount: number;
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
  reviveContext: {
    pending: boolean;
    deathLocation: string | null;
    deathCause: string | null;
    droppedLootLedger: string[];
    droppedLootOwnerLedger: Array<{ looterId: string; itemIds: string[] }>;
    lastReviveAnchorId?: string;
  } | undefined;
}): SaveSlotSnapshotSummary {
  const threatStates = Object.values(input.mainThreatByFloor ?? {})
    .filter((x) => x && (x.phase === "active" || x.phase === "breached" || x.phase === "suppressed"))
    .slice(0, 3)
    .map((x) => `${x.floorId}:${x.phase}:${x.suppressionProgress}`);
  const npcFlags = Object.entries(input.dynamicNpcStates ?? {})
    .filter(([, v]) => v && !v.isAlive)
    .slice(0, 5)
    .map(([id]) => `${id}:dead`);
  const deathSummary = input.reviveContext?.deathLocation
    ? `${input.reviveContext.deathLocation} / ${input.reviveContext.deathCause ?? "未知"}`
    : null;
  return {
    day: Math.max(0, Math.trunc(input.day)),
    hour: Math.max(0, Math.trunc(input.hour)),
    playerLocation: input.playerLocation || "B1_SafeZone",
    floorScore: resolveFloorScore(input.playerLocation || "B1_SafeZone"),
    activeProfession: null,
    activeTasksCount: Math.max(0, Math.trunc(input.activeTasksCount)),
    keyThreatStates: threatStates,
    keyNpcFlags: npcFlags,
    revivePending: Boolean(input.reviveContext?.pending),
    recentDeathSummary: deathSummary,
  };
}

export function normalizeSaveSlotMeta(meta: unknown, fallback: Omit<SaveSlotMeta, "updatedAt" | "snapshotSummary"> & {
  updatedAt?: string;
  snapshotSummary: SaveSlotSnapshotSummary;
}): SaveSlotMeta {
  const nowIso = new Date().toISOString();
  const base: SaveSlotMeta = {
    slotId: fallback.slotId,
    label: fallback.label,
    kind: fallback.kind,
    createdAt: fallback.createdAt,
    updatedAt: fallback.updatedAt ?? nowIso,
    runId: fallback.runId,
    parentSlotId: fallback.parentSlotId,
    branchFromDecisionId: fallback.branchFromDecisionId,
    snapshotSummary: fallback.snapshotSummary,
  };
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return base;
  const raw = meta as Record<string, unknown>;
  return {
    slotId: typeof raw.slotId === "string" && raw.slotId ? raw.slotId : base.slotId,
    label: typeof raw.label === "string" && raw.label ? raw.label : base.label,
    kind:
      raw.kind === "main" || raw.kind === "branch" || raw.kind === "auto_branch"
        ? raw.kind
        : base.kind,
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : base.updatedAt,
    runId: typeof raw.runId === "string" && raw.runId ? raw.runId : base.runId,
    parentSlotId: typeof raw.parentSlotId === "string" && raw.parentSlotId ? raw.parentSlotId : base.parentSlotId,
    branchFromDecisionId:
      typeof raw.branchFromDecisionId === "string" && raw.branchFromDecisionId
        ? raw.branchFromDecisionId
        : base.branchFromDecisionId,
    snapshotSummary: base.snapshotSummary,
  };
}

export function canCreateManualBranch(input: BranchCreateGuardInput): BranchCreateGuardResult {
  if (!input.isAlive) return { ok: false, reason: "角色已死亡，无法在当前状态创建分支。" };
  if (input.revivePending) return { ok: false, reason: "复活流程待处理，无法创建分支。" };
  const inSafeZone = isAbsoluteSafeZoneLocation(input.playerLocation);
  const nearAnchor = mapAnchorUnlocksToEnabledAnchors(input.anchorUnlocks).some(
    (a) => a.nodeId === input.playerLocation
  );
  if (!inSafeZone && !nearAnchor) {
    return { ok: false, reason: "仅可在安全中枢或已激活锚点处创建分支。" };
  }
  if (input.currentFloorThreat?.phase === "active") {
    return { ok: false, reason: "当前楼层主威胁处于 active，高压状态禁止分支。" };
  }
  return { ok: true, reason: null };
}
