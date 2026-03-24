import { getServicesForLocation } from "@/lib/registry/serviceNodes";
import {
  buildFloorProgressionPacket,
  buildForgePacket,
  buildTacticalContextPacket,
  buildThreatPacket,
  buildWeaponPacket,
  inferFloorThreatTier,
} from "./stage2Packets";

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
const MAIN_THREAT_RE = /主威胁状态：([^。]+)。/;
const EQUIPPED_WEAPON_RE = /主手武器\[([^\]|]+)\|稳定(\d+)\|反制([^|\]]*)(?:\|模组([^|\]]*))?(?:\|灌注([^|\]]*))?(?:\|污染(\d+))?(?:\|可修复([01]))?\]/;

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

function parseMainThreatMap(playerContext: string): Record<string, {
  threatId: string;
  phase: MainThreatPhase;
  suppressionProgress: number;
}> {
  const raw = playerContext.match(MAIN_THREAT_RE)?.[1]?.trim();
  if (!raw) return {};
  const out: Record<string, { threatId: string; phase: MainThreatPhase; suppressionProgress: number }> = {};
  const chunks = raw.split("，").map((x) => x.trim()).filter(Boolean);
  for (const c of chunks) {
    const m = c.match(/^([A-Za-z0-9]+)\[([^|\]]+)\|([^|\]]+)\|(\d+)\]$/);
    if (!m) continue;
    const floorId = m[1] ?? "";
    const threatId = m[2] ?? "";
    const phaseRaw = m[3] ?? "idle";
    const phase: MainThreatPhase =
      phaseRaw === "idle" || phaseRaw === "active" || phaseRaw === "suppressed" || phaseRaw === "breached"
        ? phaseRaw
        : "idle";
    const suppressionProgress = Math.max(0, Math.min(100, Number(m[4] ?? "0") || 0));
    if (!floorId || !threatId) continue;
    out[floorId] = { threatId, phase, suppressionProgress };
  }
  return out;
}

function parseEquippedWeapon(playerContext: string): {
  weaponId: string | null;
  stability: number | null;
  counterTags: string[];
  mods: string[];
  infusions: string[];
  contamination: number | null;
  repairable: boolean | null;
} {
  const m = playerContext.match(EQUIPPED_WEAPON_RE);
  if (!m) return { weaponId: null, stability: null, counterTags: [], mods: [], infusions: [], contamination: null, repairable: null };
  const weaponId = (m[1] ?? "").trim() || null;
  const stability = Number(m[2] ?? "0");
  const tags = (m[3] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  const mods = (m[4] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== "无");
  const infusions = (m[5] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== "无");
  const contamination = Number(m[6] ?? "NaN");
  const repairable = m[7] === "1" ? true : m[7] === "0" ? false : null;
  return {
    weaponId,
    stability: Number.isFinite(stability) ? Math.max(0, Math.min(100, stability)) : null,
    counterTags: tags,
    mods,
    infusions,
    contamination: Number.isFinite(contamination) ? Math.max(0, Math.min(100, contamination)) : null,
    repairable,
  };
}

function compactRuntimeLore(runtimeLoreCompact: string): string[] {
  if (!runtimeLoreCompact.trim()) return [];
  return runtimeLoreCompact
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);
}

type MainThreatPhase = "idle" | "active" | "suppressed" | "breached";

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
  const mainThreatMap = parseMainThreatMap(args.playerContext);
  const equippedWeapon = parseEquippedWeapon(args.playerContext);
  const services = getServicesForLocation(location, args.serviceState ?? {}).map((svc) => ({
    id: svc.id,
    kind: svc.kind,
    available: svc.available,
    npcIds: svc.npcIds,
  }));
  const nearbyNpcIds = npcPositions.filter((x) => x.location === location).map((x) => x.npcId);
  const loreLines = compactRuntimeLore(args.runtimeLoreCompact ?? "");
  const threatPacket = buildThreatPacket({
    location,
    contextThreatMap: mainThreatMap,
  });
  const weaponPacket = buildWeaponPacket({
    weapon: equippedWeapon,
    threatName: threatPacket.activeThreatName,
    threatId: threatPacket.activeThreatId,
  });
  const forgePacket = buildForgePacket({
    location,
    serviceState: args.serviceState,
    contextThreatPhase: threatPacket.phase,
  });

  const packets = {
    current_location_packet: {
      location,
      time,
      floorThreatTier: inferFloorThreatTier(location),
    },
    main_threat_packet: threatPacket,
    weapon_packet: weaponPacket,
    forge_packet: forgePacket,
    floor_progression_packet: buildFloorProgressionPacket({
      location,
      worldFlags,
      recentEvents: revive ? [`recent_revive@${String(revive.lastReviveAnchorId ?? "unknown")}`] : [],
      discoveredTruths: worldFlags.filter((x) => x.includes("truth") || x.includes("conspiracy")),
    }),
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
    tactical_context_packet: buildTacticalContextPacket({
      latestUserInput: args.latestUserInput,
      activeTasks: tasks,
      runtimeLoreHints: loreLines,
      nearbyNpcIds,
      threatPhase: threatPacket.phase,
    }),
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
    main_threat_packet: packets.main_threat_packet,
    weapon_packet: packets.weapon_packet,
    forge_packet: packets.forge_packet,
    floor_progression_packet: packets.floor_progression_packet,
    active_tasks_packet: packets.active_tasks_packet.slice(0, 4),
    anchor_revive_packet: packets.anchor_revive_packet,
    service_nodes_packet: {
      location: packets.service_nodes_packet.location,
      services: packets.service_nodes_packet.services.slice(0, 4),
    },
    tactical_context_packet: packets.tactical_context_packet,
  };
  const compactText = [
    "## 【运行时结构化上下文包（权威事实源）】",
    "你必须优先遵从以下 JSON packet；若与静态记忆冲突，以 packet 为准。",
    JSON.stringify(compactPackets),
  ].join("\n");
  return compactText.slice(0, maxChars);
}

