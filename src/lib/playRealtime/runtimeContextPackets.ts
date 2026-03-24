import { getServicesForLocation } from "@/lib/registry/serviceNodes";

type ServiceStateInput = {
  shopUnlocked?: boolean;
  forgeUnlocked?: boolean;
  anchorUnlocked?: boolean;
  unlockFlags?: Record<string, boolean>;
};

const LOCATION_RE = /用户位置\[([^\]]+)\]/;
const TIME_RE = /游戏时间\[第(\d+)日\s+(\d+)时\]/;
const WORLD_FLAGS_RE = /世界标记：([^。]+)。/;
const ANCHOR_RE = /锚点解锁：B1\[(\d)\]，1F\[(\d)\]，7F\[(\d)\]/;
const REVIVE_RE = /最近复活：死亡地点\[([^\]]*)]，死因\[([^\]]*)]，掉落数量\[(\d+)]，最近锚点\[([^\]]*)]/;
const TASKS_RE = /任务追踪：([^。]+)。/;
const NPC_POS_RE = /NPC当前位置：([^。]+)。/;
const CODEX_RE = /图鉴已解锁：([^。]+)。/;

function parseLocation(playerContext: string, fallbackLocation: string | null): string | null {
  const fromContext = playerContext.match(LOCATION_RE)?.[1]?.trim();
  if (fromContext) return fromContext;
  return fallbackLocation;
}

function parseTime(playerContext: string): { day: number | null; hour: number | null } {
  const m = playerContext.match(TIME_RE);
  if (!m) return { day: null, hour: null };
  return {
    day: Number.parseInt(m[1] ?? "", 10) || 0,
    hour: Number.parseInt(m[2] ?? "", 10) || 0,
  };
}

function parseWorldFlags(playerContext: string): string[] {
  const raw = playerContext.match(WORLD_FLAGS_RE)?.[1]?.trim();
  if (!raw || raw === "无") return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseAnchorState(playerContext: string): { B1: boolean; "1": boolean; "7": boolean } {
  const m = playerContext.match(ANCHOR_RE);
  if (!m) return { B1: true, "1": true, "7": false };
  return {
    B1: m[1] === "1",
    "1": m[2] === "1",
    "7": m[3] === "1",
  };
}

function parseRevive(playerContext: string): Record<string, unknown> | null {
  const m = playerContext.match(REVIVE_RE);
  if (!m) return null;
  return {
    deathLocation: (m[1] ?? "").trim() || null,
    deathCause: (m[2] ?? "").trim() || null,
    droppedLootCount: Number.parseInt(m[3] ?? "0", 10) || 0,
    lastReviveAnchorId: (m[4] ?? "").trim() || null,
  };
}

function parseTasks(playerContext: string): string[] {
  const raw = playerContext.match(TASKS_RE)?.[1]?.trim();
  if (!raw) return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseNpcPositions(playerContext: string): Array<{ npcId: string; location: string }> {
  const raw = playerContext.match(NPC_POS_RE)?.[1]?.trim();
  if (!raw) return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => {
      const [npcId, location] = line.split("@");
      return { npcId: (npcId ?? "").trim(), location: (location ?? "").trim() };
    })
    .filter((x) => x.npcId && x.location)
    .slice(0, 12);
}

function parseRelationshipHints(playerContext: string): string[] {
  const raw = playerContext.match(CODEX_RE)?.[1]?.trim();
  if (!raw) return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function inferFloorThreatTier(location: string | null): "b1_safe" | "low" | "mid" | "high" | "extreme" {
  if (!location) return "low";
  if (location.startsWith("B1_")) return "b1_safe";
  if (location.startsWith("1F_")) return "low";
  if (location.startsWith("2F_") || location.startsWith("3F_")) return "mid";
  if (location.startsWith("4F_") || location.startsWith("5F_")) return "high";
  if (location.startsWith("6F_") || location.startsWith("7F_") || location.startsWith("B2_")) return "extreme";
  return "low";
}

function compactRuntimeLore(runtimeLoreCompact: string): string[] {
  if (!runtimeLoreCompact.trim()) return [];
  return runtimeLoreCompact
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function buildRuntimeContextPackets(args: {
  playerContext: string;
  latestUserInput: string;
  playerLocation: string | null;
  serviceState?: ServiceStateInput;
  runtimeLoreCompact?: string;
  maxChars?: number;
}): string {
  const location = parseLocation(args.playerContext, args.playerLocation);
  const time = parseTime(args.playerContext);
  const worldFlags = parseWorldFlags(args.playerContext);
  const anchorUnlocks = parseAnchorState(args.playerContext);
  const revive = parseRevive(args.playerContext);
  const tasks = parseTasks(args.playerContext);
  const npcPositions = parseNpcPositions(args.playerContext);
  const relationshipHints = parseRelationshipHints(args.playerContext);
  const services = getServicesForLocation(location, args.serviceState ?? {}).map((svc) => ({
    id: svc.id,
    kind: svc.kind,
    available: svc.available,
    npcIds: svc.npcIds,
  }));
  const nearbyNpcIds = npcPositions.filter((x) => x.location === location).map((x) => x.npcId);
  const loreLines = compactRuntimeLore(args.runtimeLoreCompact ?? "");

  const packets = {
    current_location_packet: {
      location,
      time,
      floorThreatTier: inferFloorThreatTier(location),
    },
    nearby_npc_packet: nearbyNpcIds,
    active_tasks_packet: tasks,
    anchor_revive_packet: {
      anchorUnlocks,
      revive,
    },
    service_nodes_packet: {
      location,
      services,
    },
    relationship_packet: relationshipHints,
    world_state_packet: {
      worldFlags,
      recentWorldEvents: revive ? [`recent_revive@${String(revive.lastReviveAnchorId ?? "unknown")}`] : [],
      discoveredTruths: worldFlags.filter((x) => x.includes("truth") || x.includes("conspiracy")),
    },
    high_priority_constraints_packet: {
      latestUserInput: args.latestUserInput.slice(0, 200),
      runtimeLoreHints: loreLines,
      immutableRules: [
        "严格输出单个 JSON 对象并满足契约字段",
        "运行时动态注入事实优先于静态记忆",
        "禁止凭空新增节点/NPC/道具ID",
      ],
    },
  };
  const text = [
    "## 【运行时结构化上下文包（权威事实源）】",
    "你必须优先遵从以下 JSON packet；若与静态记忆冲突，以 packet 为准。",
    JSON.stringify(packets),
  ].join("\n");
  const maxChars = args.maxChars && args.maxChars > 300 ? args.maxChars : 2600;
  if (text.length <= maxChars) return text;
  const compactPackets = {
    current_location_packet: packets.current_location_packet,
    active_tasks_packet: packets.active_tasks_packet.slice(0, 4),
    anchor_revive_packet: packets.anchor_revive_packet,
    service_nodes_packet: {
      location: packets.service_nodes_packet.location,
      services: packets.service_nodes_packet.services.slice(0, 4),
    },
    world_state_packet: {
      worldFlags: packets.world_state_packet.worldFlags.slice(0, 8),
      recentWorldEvents: packets.world_state_packet.recentWorldEvents.slice(0, 3),
      discoveredTruths: packets.world_state_packet.discoveredTruths.slice(0, 4),
    },
    high_priority_constraints_packet: {
      latestUserInput: packets.high_priority_constraints_packet.latestUserInput,
      immutableRules: packets.high_priority_constraints_packet.immutableRules,
    },
  };
  const compactText = [
    "## 【运行时结构化上下文包（权威事实源）】",
    "你必须优先遵从以下 JSON packet；若与静态记忆冲突，以 packet 为准。",
    JSON.stringify(compactPackets),
  ].join("\n");
  return compactText.slice(0, maxChars);
}

