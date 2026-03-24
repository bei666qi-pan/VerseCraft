import type { SnapshotNpcState } from "./types";
import type { NpcRelationStateV2 } from "@/lib/registry/types";

function resolveFavorability(codex: Record<string, { favorability?: number }>, npcId: string): number {
  const v = codex[npcId]?.favorability;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function buildNpcSnapshotMap(args: {
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
  homeSeed: Record<string, string>;
  codex: Record<string, { favorability?: number }>;
}): Record<string, SnapshotNpcState> {
  const ids = new Set<string>([
    ...Object.keys(args.homeSeed ?? {}),
    ...Object.keys(args.dynamicNpcStates ?? {}),
  ]);

  const toRelationState = (favorability: number): NpcRelationStateV2 => ({
    favorability,
    trust: Math.max(-100, Math.min(100, Math.trunc(favorability / 2))),
    fear: 0,
    debt: 0,
    affection: 0,
    desire: 0,
    romanceEligible: false,
    romanceStage: "none",
    betrayalFlags: [],
  });

  const out: Record<string, SnapshotNpcState> = {};
  for (const id of ids) {
    const dynamic = args.dynamicNpcStates?.[id];
    const location =
      dynamic?.currentLocation ??
      args.homeSeed?.[id] ??
      "B1_SafeZone";
    out[id] = {
      currentLocation: location,
      alive: dynamic?.isAlive !== false,
      favorability: resolveFavorability(args.codex ?? {}, id),
      relationshipState: toRelationState(resolveFavorability(args.codex ?? {}, id)),
      inventoryHeld: [],
      taskState: "none",
      discoveredByPlayer: Boolean(args.codex?.[id]),
    };
  }
  return out;
}
