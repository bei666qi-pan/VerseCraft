import { buildWorldGraph, canTraverseWorldEdge } from "@/lib/revive/graph";

type RecordLike = Record<string, unknown>;

const LEGACY_LOCATION_ALIASES: Record<string, string> = {
  "旧公寓三楼走廊": "3F_Hallway",
  "旧公寓三楼楼梯间": "3F_Stairwell",
  "旧公寓二楼楼梯转角": "2F_Corridor",
  "二楼楼梯转角": "2F_Corridor",
  "一楼登记口": "1F_Lobby",
  "B1_配电间": "B1_PowerRoom",
  "地下一层配电间": "B1_PowerRoom",
};

function canonicalLocation(value: string): string {
  return LEGACY_LOCATION_ALIASES[value] ?? value;
}

function isMovementAction(action: string): boolean {
  if (/(?:聊聊|聊天|交谈|谈谈|对话|说话|询问|问问|搭话|沟通)/.test(action)) return false;
  return /(?:前往|进入|走到|走向|移动到|回到|离开.*去|下楼|上楼|下到|上到|穿过|沿着.*楼梯)/.test(action);
}

function floorNumber(location: string): number | null {
  const match = location.match(/^(B[12]|[1-7]F)_/i);
  if (!match) return null;
  const token = match[1]!.toUpperCase();
  if (token === "B2") return -2;
  if (token === "B1") return -1;
  return Number.parseInt(token, 10);
}

function explicitlyRequestsMultiHop(action: string, from: string): boolean {
  if (!/直接/.test(action)) return false;
  const target = action.match(/(?:B[12]|[1-7]F|[一二三四五六七]楼)/i)?.[0];
  if (!target) return false;
  const targetFloor = floorNumber(`${target.toUpperCase()}_placeholder`)
    ?? ({ 一楼: 1, 二楼: 2, 三楼: 3, 四楼: 4, 五楼: 5, 六楼: 6, 七楼: 7 } as Record<string, number>)[target];
  const fromFloor = floorNumber(from);
  return targetFloor !== null && targetFloor !== undefined && fromFloor !== null && Math.abs(targetFloor - fromFloor) > 1;
}

function appendFlag(dmRecord: RecordLike, flag: string): string[] {
  const flags = Array.isArray(dmRecord._commit_flags)
    ? dmRecord._commit_flags.filter((value): value is string => typeof value === "string")
    : [];
  return [...new Set([...flags, flag])];
}

function resolveActionTarget(action: string, from: string, graph: Map<string, Set<string>>): string | null {
  const neighbors = [...(graph.get(from) ?? [])];
  const explicit = [...graph.keys()].find((node) => action.includes(node))
    ?? Object.entries(LEGACY_LOCATION_ALIASES).find(([alias]) => action.includes(alias))?.[1];
  if (explicit && neighbors.includes(explicit)) return explicit;

  const wantsDown = /(?:下楼|下到|往下|向下|楼下)/.test(action);
  const wantsUp = /(?:上楼|上到|往上|向上|楼上)/.test(action);
  if (!wantsDown && !wantsUp) return null;
  if (explicitlyRequestsMultiHop(action, from)) return null;

  const fromFloor = floorNumber(from);
  const vertical = neighbors.find((node) => {
    const nodeFloor = floorNumber(node);
    return fromFloor !== null && nodeFloor !== null && (wantsDown ? nodeFloor < fromFloor : nodeFloor > fromFloor);
  });
  if (vertical) return vertical;

  // A corridor can require one confirmed local step before the next vertical
  // edge. Entering the registered stairwell is safe; claiming the lower floor
  // would be a multi-hop hallucination.
  return neighbors.find((node) => /_Stairwell$/i.test(node)) ?? null;
}

function noConfirmedMovement(dmRecord: RecordLike, rawFrom: string): RecordLike {
  const next = { ...dmRecord };
  delete next.player_location;
  return {
    ...next,
    is_action_legal: false,
    consumes_time: false,
    narrative: `我没能确认一条从${rawFrom || "当前位置"}出发的可通行相邻路线，因此仍留在原地。`,
    _commit_flags: appendFlag(next, "invalid_location_delta_blocked_v2"),
  };
}

/**
 * Validates model-proposed locations and, for an explicit player movement
 * action, resolves only one canonical graph edge. Narrative never becomes a
 * state source: all targets originate from the registered world graph.
 */
export function applyAuthoredLocationMovementGuard(args: {
  dmRecord: RecordLike;
  latestUserInput: string;
  clientState?: { playerLocation?: string; worldFlags?: string[] } | null;
  enableCanonicalLocationMovement?: boolean;
}): RecordLike {
  const action = String(args.latestUserInput ?? "");
  const graph = buildWorldGraph({ includeLockedEdges: true });
  const rawFrom = String(args.clientState?.playerLocation ?? "");
  const from = canonicalLocation(rawFrom);
  const rawCandidate = typeof args.dmRecord.player_location === "string" ? args.dmRecord.player_location : "";
  const candidate = canonicalLocation(rawCandidate);
  const movementRequested = isMovementAction(action);
  const synthesisEnabled = args.enableCanonicalLocationMovement !== false;
  const canMoveTo = (target: string) =>
    Boolean(from && graph.has(from) && graph.has(target) && graph.get(from)?.has(target))
    && canTraverseWorldEdge(from, target, args.clientState?.worldFlags ?? []);
  const synthesizedTarget = synthesisEnabled && movementRequested && graph.has(from)
    ? resolveActionTarget(action, from, graph)
    : null;

  if (candidate && candidate === from) {
    if (synthesizedTarget && canMoveTo(synthesizedTarget)) {
      return {
        ...args.dmRecord,
        player_location: synthesizedTarget,
        narrative: `我沿着已登记的相邻通道从${from}进入${synthesizedTarget}。更远处的路线仍需逐段确认。`,
        _commit_flags: appendFlag(args.dmRecord, "canonical_location_transition_v1"),
      };
    }
    return rawCandidate === candidate
      ? args.dmRecord
      : { ...args.dmRecord, player_location: candidate, _commit_flags: appendFlag(args.dmRecord, "canonical_location_normalized_v1") };
  }

  if (candidate && canMoveTo(candidate)) {
    const narrative = String(args.dmRecord.narrative ?? "");
    const contradicted = /锁了|锁着|进不去|无法进入|不能进入/.test(narrative);
    return {
      ...args.dmRecord,
      player_location: candidate,
      narrative: contradicted ? `我沿着已登记的相邻通道从${from}进入${candidate}，位置变化已确认。` : narrative,
      _commit_flags: appendFlag(args.dmRecord, "authored_location_transition_v1"),
    };
  }

  if (synthesizedTarget && canMoveTo(synthesizedTarget)) {
    return {
      ...args.dmRecord,
      player_location: synthesizedTarget,
      narrative: `我沿着已登记的相邻通道从${from}进入${synthesizedTarget}。更远处的路线仍需逐段确认。`,
      _commit_flags: appendFlag(args.dmRecord, "canonical_location_transition_v1"),
    };
  }

  if (candidate) {
    if (movementRequested) return noConfirmedMovement(args.dmRecord, rawFrom);
    const next = { ...args.dmRecord };
    delete next.player_location;
    return { ...next, _commit_flags: appendFlag(next, "invalid_location_delta_stripped_v1") };
  }

  return args.dmRecord;
}
