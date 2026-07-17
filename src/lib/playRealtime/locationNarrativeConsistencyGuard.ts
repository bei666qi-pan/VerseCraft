type RecordLike = Record<string, unknown>;

function floorTokens(text: string): Set<string> {
  return new Set(text.match(/(?:B[12]|[1-7]F|[一二三四五六七]楼)/gi)?.map((x) => x.toUpperCase()) ?? []);
}

/** Blocks prose-only cross-floor travel when no authoritative location delta survived. */
export function applyLocationNarrativeConsistencyGuard(args: {
  dmRecord: RecordLike;
  clientState?: { playerLocation?: string } | null;
}): RecordLike {
  const narrative = typeof args.dmRecord.narrative === "string" ? args.dmRecord.narrative : "";
  if (!narrative || typeof args.dmRecord.player_location === "string") return args.dmRecord;
  const floors = floorTokens(narrative);
  const travel = /(?:下到|上到|穿过|继续下|走进|踏入|来到)/.test(narrative);
  if (!travel || floors.size < 2) return args.dmRecord;
  const flags = Array.isArray(args.dmRecord._commit_flags)
    ? args.dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  return {
    ...args.dmRecord,
    is_action_legal: false,
    consumes_time: false,
    narrative: `我没有跨越多个楼层；本回合没有通过世界图校验的位置变化，因此仍留在${args.clientState?.playerLocation ?? "原地"}。`,
    _commit_flags: [...new Set([...flags, "prose_only_cross_floor_travel_blocked_v1"])],
  };
}
