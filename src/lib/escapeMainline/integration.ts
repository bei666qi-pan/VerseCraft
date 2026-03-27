import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import type { EscapeMainlineState } from "./types";
import { normalizeEscapeMainline, advanceEscapeMainlineFromState } from "./reducer";
import type { EscapeDerivationInput } from "./derive";

export function advanceEscapeMainlineFromResolvedTurn(args: {
  prevEscapeRaw: unknown;
  nowHour: number;
  nowTurn: number;
  playerLocation: string;
  tasks: GameTaskV2[];
  codex: Record<string, any>;
  inventoryItemIds: string[];
  worldFlags: string[];
  memoryEntries: MemorySpineEntry[];
  resolvedTurn: any;
  changedBy: string;
}): EscapeMainlineState {
  const prev = normalizeEscapeMainline(args.prevEscapeRaw, args.nowHour);
  const derived: EscapeDerivationInput = {
    nowHour: args.nowHour,
    nowTurn: args.nowTurn,
    playerLocation: args.playerLocation,
    tasks: args.tasks,
    codex: args.codex,
    inventoryItemIds: args.inventoryItemIds,
    worldFlags: args.worldFlags,
    memoryEntries: args.memoryEntries,
  };
  return advanceEscapeMainlineFromState({
    prev,
    derived,
    resolvedTurn: args.resolvedTurn,
    changedBy: args.changedBy,
  });
}

