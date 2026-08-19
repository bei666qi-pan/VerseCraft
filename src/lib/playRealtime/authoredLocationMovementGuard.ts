import { buildWorldGraph, canTraverseWorldEdge } from "@/lib/revive/graph";
import { formatLocationLabel } from "@/lib/ui/locationLabels";

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

export function canonicalizeWorldLocationId(value: string): string {
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

function explicitNeighborAliases(node: string): string[] {
  const aliases = new Set<string>([node, node.toLowerCase()]);
  const room = node.match(/(?:^|_)Room(\d{2,4})$/i)?.[1];
  if (room) {
    aliases.add(room);
    aliases.add(`${room}室`);
    aliases.add(`房间${room}`);
  }
  const suffix = node.split("_").slice(1).join("_");
  if (suffix) aliases.add(suffix);
  if (/_Stairwell$/i.test(node)) aliases.add("楼梯间");
  if (/_Hallway$/i.test(node)) aliases.add("走廊");
  if (/_Corridor(?:End)?$/i.test(node)) {
    aliases.add("走廊");
    aliases.add("楼梯转角");
  }
  if (/_Lobby$/i.test(node)) {
    aliases.add("大堂");
    aliases.add("大厅");
    aliases.add("门厅");
  }
  for (const [legacy, canonical] of Object.entries(LEGACY_LOCATION_ALIASES)) {
    if (canonical === node) aliases.add(legacy);
  }
  return [...aliases].filter((alias) => alias.length >= 2);
}

function resolveExplicitNeighborTarget(action: string, neighbors: string[]): string | null {
  const normalizedAction = action.toLowerCase().replace(/\s+/g, "");
  const matched = neighbors.filter((node) =>
    explicitNeighborAliases(node).some((alias) => normalizedAction.includes(alias.toLowerCase().replace(/\s+/g, "")))
  );
  return matched.length === 1 ? matched[0]! : null;
}

function resolveActionTarget(action: string, from: string, graph: Map<string, Set<string>>): string | null {
  const neighbors = [...(graph.get(from) ?? [])];
  const explicit = resolveExplicitNeighborTarget(action, neighbors);
  if (explicit) return explicit;

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

function readableLocation(location: string): string {
  const label = formatLocationLabel(location);
  if (label !== "未知区域") return label;
  const floorNames: Record<string, string> = {
    "1": "一",
    "2": "二",
    "3": "三",
    "4": "四",
    "5": "五",
    "6": "六",
    "7": "七",
  };
  return location
    .replace(/^B(\d+)_/i, (_match, floor: string) => `地下${floorNames[floor] ?? floor}层`)
    .replace(/^(\d+)F_/i, (_match, floor: string) => `${floorNames[floor] ?? floor}楼`)
    .replace(/_/g, "")
    .replace(/Hallway/gi, "走廊")
    .replace(/CorridorEnd/gi, "走廊尽头")
    .replace(/Corridor/gi, "走廊")
    .replace(/Stairwell/gi, "楼梯间")
    .replace(/Lobby/gi, "门厅")
    .replace(/Room/gi, "房间");
}

function confirmedMovementNarrative(from: string, to: string): string {
  return `我离开${readableLocation(from)}，沿着相连的通路稳步前行，抵达${readableLocation(to)}。脚步在这里停下，我先确认身边的门、光线与来路，再决定下一步。`;
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
  const from = canonicalizeWorldLocationId(rawFrom);
  const rawCandidate = typeof args.dmRecord.player_location === "string" ? args.dmRecord.player_location : "";
  const candidate = canonicalizeWorldLocationId(rawCandidate);
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
        narrative: confirmedMovementNarrative(from, synthesizedTarget),
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
      narrative: contradicted ? confirmedMovementNarrative(from, candidate) : narrative,
      _commit_flags: appendFlag(args.dmRecord, "authored_location_transition_v1"),
    };
  }

  if (synthesizedTarget && canMoveTo(synthesizedTarget)) {
    return {
      ...args.dmRecord,
      player_location: synthesizedTarget,
      narrative: confirmedMovementNarrative(from, synthesizedTarget),
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
