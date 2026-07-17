import { buildWorldGraph, canTraverseWorldEdge } from "@/lib/revive/graph";

type RecordLike = Record<string, unknown>;

const LEGACY_LOCATION_ALIASES: Record<string, string> = {
  "旧公寓三楼走廊": "3F_Hallway",
  "旧公寓三楼楼梯间": "3F_Stairwell",
  "B1_配电间": "B1_PowerRoom",
  "地下一层配电间": "B1_PowerRoom",
};

function canonicalLocation(value: string): string {
  return LEGACY_LOCATION_ALIASES[value] ?? value;
}

export function applyAuthoredLocationMovementGuard(args: {
  dmRecord: RecordLike;
  latestUserInput: string;
  clientState?: { playerLocation?: string; worldFlags?: string[] } | null;
}): RecordLike {
  const action = String(args.latestUserInput ?? "");
  const graph = buildWorldGraph({ includeLockedEdges: true });
  const rawFrom = String(args.clientState?.playerLocation ?? "");
  const from = canonicalLocation(rawFrom);
  const rawCandidate = typeof args.dmRecord.player_location === "string" ? args.dmRecord.player_location : "";
  const candidate = canonicalLocation(rawCandidate);
  if (candidate && candidate !== from && graph.has(from)) {
    const valid = graph.has(candidate) && graph.get(from)?.has(candidate) && canTraverseWorldEdge(from, candidate, args.clientState?.worldFlags ?? []);
    if (!valid) {
      const next = { ...args.dmRecord };
      delete next.player_location;
      next.is_action_legal = false;
      next.consumes_time = false;
      next.narrative = `我无法从${rawFrom}直接到达${rawCandidate}：世界图中没有当前可通行的相邻边。我仍留在原地。`;
      next._commit_flags = [...(Array.isArray(next._commit_flags) ? next._commit_flags : []), "invalid_location_delta_blocked_v1"];
      return next;
    }
  }
  if (!/(前往|进入|走到|移动到|回到|离开.*去)/.test(action)) return args.dmRecord;
  const target = [...graph.keys()].find((node) => action.includes(node));
  if (!target || !from || target === from || !graph.get(from)?.has(target)) return args.dmRecord;
  if (!canTraverseWorldEdge(from, target, args.clientState?.worldFlags ?? [])) return args.dmRecord;
  const narrative = String(args.dmRecord.narrative ?? "");
  const contradicted = /锁了|锁着|进不去|无法进入|不能进入/.test(narrative);
  return {
    ...args.dmRecord,
    player_location: target,
    narrative: contradicted ? `我沿着已登记的相邻通道从${from}进入${target}，位置变化已确认。` : narrative,
    _commit_flags: [...(Array.isArray(args.dmRecord._commit_flags) ? args.dmRecord._commit_flags : []), "authored_location_transition_v1"],
  };
}
