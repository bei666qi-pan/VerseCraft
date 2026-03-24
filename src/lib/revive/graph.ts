import { MAP_ROOMS } from "@/lib/registry/world";

const FLOOR_INTERNAL_EDGES: Array<[string, string]> = [
  ["B1_SafeZone", "B1_Storage"],
  ["B1_SafeZone", "B1_Laundry"],
  ["B1_SafeZone", "B1_PowerRoom"],
  ["1F_Lobby", "1F_PropertyOffice"],
  ["1F_Lobby", "1F_GuardRoom"],
  ["1F_Lobby", "1F_Mailboxes"],
  ["2F_Corridor", "2F_Clinic201"],
  ["2F_Corridor", "2F_Room202"],
  ["2F_Corridor", "2F_Room203"],
  ["3F_Stairwell", "3F_Room301"],
  ["3F_Stairwell", "3F_Room302"],
  ["4F_CorridorEnd", "4F_Room401"],
  ["4F_CorridorEnd", "4F_Room402"],
  ["5F_Studio503", "5F_Room501"],
  ["5F_Studio503", "5F_Room502"],
  ["6F_Stairwell", "6F_Room601"],
  ["6F_Stairwell", "6F_Room602"],
  ["7F_Bench", "7F_Room701"],
  ["7F_Bench", "7F_Kitchen"],
  ["7F_Bench", "7F_SealedDoor"],
  ["B2_Passage", "B2_GatekeeperDomain"],
];

const FLOOR_VERTICAL_EDGES: Array<[string, string]> = [
  ["B1_SafeZone", "1F_Lobby"],
  ["1F_Lobby", "2F_Corridor"],
  ["2F_Corridor", "3F_Stairwell"],
  ["3F_Stairwell", "4F_CorridorEnd"],
  ["4F_CorridorEnd", "5F_Studio503"],
  ["5F_Studio503", "6F_Stairwell"],
  ["6F_Stairwell", "7F_Bench"],
  ["B1_SafeZone", "B2_Passage"],
];

function addEdge(map: Map<string, Set<string>>, a: string, b: string) {
  if (!map.has(a)) map.set(a, new Set());
  if (!map.has(b)) map.set(b, new Set());
  map.get(a)!.add(b);
  map.get(b)!.add(a);
}

export function buildWorldGraph(): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const rooms of Object.values(MAP_ROOMS)) {
    for (const r of rooms) {
      if (!g.has(r)) g.set(r, new Set());
    }
  }
  for (const [a, b] of [...FLOOR_INTERNAL_EDGES, ...FLOOR_VERTICAL_EDGES]) {
    addEdge(g, a, b);
  }
  return g;
}

export function shortestPathDistance(graph: Map<string, Set<string>>, start: string, target: string): number {
  if (!start || !target) return Number.POSITIVE_INFINITY;
  if (start === target) return 0;
  if (!graph.has(start) || !graph.has(target)) return Number.POSITIVE_INFINITY;
  const q: Array<{ node: string; dist: number }> = [{ node: start, dist: 0 }];
  const visited = new Set<string>([start]);
  while (q.length > 0) {
    const cur = q.shift()!;
    for (const nxt of graph.get(cur.node) ?? []) {
      if (visited.has(nxt)) continue;
      if (nxt === target) return cur.dist + 1;
      visited.add(nxt);
      q.push({ node: nxt, dist: cur.dist + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}
