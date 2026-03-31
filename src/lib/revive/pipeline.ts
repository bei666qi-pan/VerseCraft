import type { Item } from "@/lib/registry/types";
import type { GameTask } from "@/store/useGameStore";
import { mapAnchorUnlocksToEnabledAnchors, type AnchorDefinition } from "./anchorRegistry";
import { buildWorldGraph, shortestPathDistance } from "./graph";

export type ReviveOption = "restart" | "revive";

/** 复生契约：死亡后锚点强制拉回现实的时间代价（小时）。 */
export const REVIVE_TIME_SKIP_HOURS = 12;

export interface DeathRecord {
  deathLocation: string;
  deathCause: string;
  inventory: Item[];
  hourIndex: number;
}

export interface ReviveSyncInput {
  death: DeathRecord;
  anchorUnlocks: Record<"B1" | "1" | "7", boolean>;
  currentTime: { day: number; hour: number };
  tasks: GameTask[];
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
  killerId?: string | null;
}

export interface DroppedLootOwnership {
  looterId: string;
  itemIds: string[];
}

export interface ReviveSyncResult {
  respawnAnchor: AnchorDefinition;
  nextTime: { day: number; hour: number };
  droppedLootOwnership: DroppedLootOwnership[];
  lostPool: string[];
  taskUpdates: Array<{ id: string; status: "failed" | "completed" | "active" | "available" | "hidden" }>;
  worldFlagsPatch: Record<string, boolean>;
  conspiracyTriggered: boolean;
}

function addHours(day: number, hour: number, delta: number): { day: number; hour: number } {
  const total = Math.max(0, day * 24 + hour + delta);
  return { day: Math.floor(total / 24), hour: total % 24 };
}

function normalizeLoc(loc: string): string {
  return typeof loc === "string" && loc.trim().length > 0 ? loc.trim() : "B1_SafeZone";
}

export function resolveNearestAnchor(deathLocation: string, anchorUnlocks: Record<"B1" | "1" | "7", boolean>): AnchorDefinition {
  const enabled = mapAnchorUnlocksToEnabledAnchors(anchorUnlocks);
  if (enabled.length === 0) {
    return { id: "ANCHOR_B1", nodeId: "B1_SafeZone", floorTier: "B1", label: "B1 安全锚点" };
  }
  const graph = buildWorldGraph();
  const from = normalizeLoc(deathLocation);
  let best = enabled[0]!;
  let bestDist = shortestPathDistance(graph, from, best.nodeId);
  for (const a of enabled.slice(1)) {
    const d = shortestPathDistance(graph, from, a.nodeId);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}

export function selectLootLooter(args: {
  killerId?: string | null;
  deathLocation: string;
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
}): string {
  const deathLoc = normalizeLoc(args.deathLocation);
  const map = args.dynamicNpcStates ?? {};
  if (args.killerId && map[args.killerId]?.isAlive) return args.killerId;
  const coLocated = Object.entries(map).find(([, s]) => s?.isAlive && s.currentLocation === deathLoc);
  if (coLocated) return coLocated[0];
  const graph = buildWorldGraph();
  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [id, st] of Object.entries(map)) {
    if (!st?.isAlive) continue;
    const d = shortestPathDistance(graph, deathLoc, st.currentLocation);
    if (d < bestDist) {
      bestId = id;
      bestDist = d;
    }
  }
  return bestId ?? "LOST_POOL";
}

export function processDroppedLoot(args: {
  inventory: Item[];
  killerId?: string | null;
  deathLocation: string;
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
}): { ownership: DroppedLootOwnership[]; lostPool: string[] } {
  const itemIds = (args.inventory ?? []).map((i) => i.id).filter(Boolean);
  if (itemIds.length === 0) return { ownership: [], lostPool: [] };
  const looter = selectLootLooter({
    killerId: args.killerId,
    deathLocation: args.deathLocation,
    dynamicNpcStates: args.dynamicNpcStates,
  });
  if (looter === "LOST_POOL") {
    return { ownership: [], lostPool: itemIds };
  }
  return { ownership: [{ looterId: looter, itemIds }], lostPool: [] };
}

export function applyFastForwardTaskResolution(tasks: GameTask[]): ReviveSyncResult["taskUpdates"] {
  const out: ReviveSyncResult["taskUpdates"] = [];
  for (const t of tasks ?? []) {
    if ((t.status !== "active" && t.status !== "available") || !t.expiresAt) continue;
    const expires = Date.parse(t.expiresAt);
    if (!Number.isFinite(expires)) continue;
    out.push({ id: t.id, status: "failed" });
  }
  return out;
}

export function evaluateEarly7FConspiracyTrigger(input: ReviveSyncInput): boolean {
  const diedBeforeDay3 = input.currentTime.day < 3;
  const anchor7Unlocked = input.anchorUnlocks["7"] === true;
  const diedNearHighTier = normalizeLoc(input.death.deathLocation).startsWith("6F_") || normalizeLoc(input.death.deathLocation).startsWith("7F_");
  return diedBeforeDay3 && anchor7Unlocked && diedNearHighTier;
}

export function runReviveSyncPipeline(input: ReviveSyncInput): ReviveSyncResult {
  const respawnAnchor = resolveNearestAnchor(input.death.deathLocation, input.anchorUnlocks);
  const nextTime = addHours(input.currentTime.day, input.currentTime.hour, REVIVE_TIME_SKIP_HOURS);
  const dropped = processDroppedLoot({
    inventory: input.death.inventory,
    killerId: input.killerId ?? null,
    deathLocation: input.death.deathLocation,
    dynamicNpcStates: input.dynamicNpcStates,
  });
  const taskUpdates = applyFastForwardTaskResolution(input.tasks);
  const conspiracyTriggered = evaluateEarly7FConspiracyTrigger(input);
  return {
    respawnAnchor,
    nextTime,
    droppedLootOwnership: dropped.ownership,
    lostPool: dropped.lostPool,
    taskUpdates,
    worldFlagsPatch: {
      darkMoonActive: nextTime.day >= 3,
      revivedByAnchor: true,
      reviveFastForward12h: true,
      ...(conspiracyTriggered ? { conspiracy_7f_elder_trap_opened: true } : {}),
    },
    conspiracyTriggered,
  };
}

export function summarizeRevivePenaltyForUi(input: ReviveSyncInput, result: ReviveSyncResult): {
  timeSkipHours: number;
  lostItemCount: number;
  lootedItemCount: number;
  failedTaskCount: number;
} {
  const lostItemCount = Array.isArray(input.death?.inventory) ? input.death.inventory.length : 0;
  const lootedItemCount =
    (result.lostPool?.length ?? 0) +
    (result.droppedLootOwnership ?? []).reduce((acc, row) => acc + (row?.itemIds?.length ?? 0), 0);
  const failedTaskCount = (result.taskUpdates ?? []).filter((u) => u.status === "failed").length;
  return {
    timeSkipHours: REVIVE_TIME_SKIP_HOURS,
    lostItemCount,
    lootedItemCount,
    failedTaskCount,
  };
}
