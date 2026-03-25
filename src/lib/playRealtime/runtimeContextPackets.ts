import { getFloorLoreByLocation } from "@/lib/registry/floorLoreRegistry";
import { computeMaxRevealRankFromSignals, listFiredRevealRuleIds } from "@/lib/registry/revealRegistry";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { getServicesForLocation } from "@/lib/registry/serviceNodes";
import {
  buildB1OrderPacket,
  buildFloorLorePacket,
  buildKeyNpcLorePacket,
  buildOriginiumEconomyPacket,
  buildRecentWorldEventPacket,
  buildReviveAnchorLorePacket,
  buildRevealTierPacket,
  buildThreatLorePacket,
} from "./worldLorePacketBuilders";
import {
  buildFloorProgressionPacket,
  buildForgePacket,
  buildTacticalContextPacket,
  buildThreatPacket,
  buildWorldviewPacket,
  buildWeaponPacket,
  inferFloorThreatTier,
} from "./stage2Packets";
import type { ThreatSnapshot } from "./stage2Packets";

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
const PROFESSION_RE = /职业状态：当前\[([^\]]+)]，已认证\[([^\]]*)]，可认证\[([^\]]*)]，被动\[([^\]]*)]/;
const PROFESSION_PROGRESS_RE = /职业进度：([^。]+)。/;
const PROFESSION_BENEFIT_RE = /职业收益：当前\[([^\]]+)]，被动摘要\[([^\]]*)]，主动摘要\[([^\]]*)]，主动可用\[([01])]/;

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

function parseProfessionPacket(playerContext: string): {
  currentProfession: string | null;
  unlockedProfessions: string[];
  eligibleProfessions: string[];
  activePerks: string[];
  passiveSummary: string | null;
  activeSummary: string | null;
  activeAvailable: boolean;
} {
  const m = playerContext.match(PROFESSION_RE);
  const b = playerContext.match(PROFESSION_BENEFIT_RE);
  if (!m) {
    return {
      currentProfession: null,
      unlockedProfessions: [],
      eligibleProfessions: [],
      activePerks: [],
      passiveSummary: b?.[2]?.trim() || null,
      activeSummary: b?.[3]?.trim() || null,
      activeAvailable: (b?.[4] ?? "0") === "1",
    };
  }
  const parseList = (s: string) =>
    String(s ?? "")
      .split("/")
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => x !== "无");
  const cur = (m[1] ?? "").trim();
  return {
    currentProfession: cur && cur !== "无" ? cur : null,
    unlockedProfessions: parseList(m[2] ?? ""),
    eligibleProfessions: parseList(m[3] ?? ""),
    activePerks: parseList(m[4] ?? ""),
    passiveSummary: b?.[2]?.trim() || null,
    activeSummary: b?.[3]?.trim() || null,
    activeAvailable: (b?.[4] ?? "0") === "1",
  };
}

function parseProfessionProgressPacket(playerContext: string): Array<{
  profession: string;
  statQualified: boolean;
  behaviorEvidence: string;
  behaviorEvidenceCount: number;
  behaviorEvidenceTarget: number;
  trialCompleted: boolean;
  certified: boolean;
}> {
  const raw = playerContext.match(PROFESSION_PROGRESS_RE)?.[1]?.trim();
  if (!raw) return [];
  const chunks = raw.split("，").map((x) => x.trim()).filter(Boolean);
  const out: Array<{
    profession: string;
    statQualified: boolean;
    behaviorEvidence: string;
    behaviorEvidenceCount: number;
    behaviorEvidenceTarget: number;
    trialCompleted: boolean;
    certified: boolean;
  }> = [];
  for (const line of chunks) {
    const m = line.match(/^([^\[]+)\[属性([01])\|行为([^|\]]+)\|试炼([01])\|认证([01])\]$/);
    if (!m) continue;
    const behaviorEvidenceRaw = (m[3] ?? "").trim();
    const behaviorEvidenceCount = Number.parseInt(behaviorEvidenceRaw.split("/")[0] ?? "0", 10) || 0;
    const behaviorEvidenceTarget = Number.parseInt(behaviorEvidenceRaw.split("/")[1] ?? "0", 10) || 0;
    out.push({
      profession: (m[1] ?? "").trim(),
      statQualified: (m[2] ?? "0") === "1",
      behaviorEvidence: behaviorEvidenceRaw,
      behaviorEvidenceCount: Math.max(0, behaviorEvidenceCount),
      behaviorEvidenceTarget: Math.max(0, behaviorEvidenceTarget),
      trialCompleted: (m[4] ?? "0") === "1",
      certified: (m[5] ?? "0") === "1",
    });
  }
  return out;
}

function buildProfessionIdentityPacket(args: {
  worldFlags: string[];
  professionPacket: ReturnType<typeof parseProfessionPacket>;
  relationshipHints: string[];
}): {
  certifiedFlags: string[];
  currentFlags: string[];
  recognitionCodexHints: string[];
  issuerRelationshipHints: string[];
  sourceConfidence: {
    flag: number;
    codex: number;
    relationship: number;
    total: number;
    level: "low" | "medium" | "high";
  };
} {
  const certifiedFlags = args.worldFlags.filter((x) => x.startsWith("profession.certified."));
  const currentFlags = args.worldFlags.filter((x) => x.startsWith("profession.current."));
  const recognitionCodexHints = args.relationshipHints.filter((x) => x.includes("认证纪要"));
  const issuerRelationshipHints = args.relationshipHints.filter((x) => {
    if (!x.includes("|好感")) return false;
    return x.includes("电工老刘") || x.includes("洗衣房阿姨") || x.includes("夜读老人");
  });
  if (certifiedFlags.length === 0 && args.professionPacket.unlockedProfessions.length > 0) {
    for (const id of args.professionPacket.unlockedProfessions) {
      certifiedFlags.push(`profession.certified.${id}`);
    }
  }
  if (currentFlags.length === 0 && args.professionPacket.currentProfession) {
    currentFlags.push(`profession.current.${args.professionPacket.currentProfession}`);
  }
  const flagConfidence = Math.min(1, certifiedFlags.length * 0.35 + currentFlags.length * 0.25);
  const codexConfidence = Math.min(1, recognitionCodexHints.length * 0.45);
  const relationshipConfidence = Math.min(1, issuerRelationshipHints.length * 0.4);
  const totalConfidence = Math.min(
    1,
    flagConfidence * 0.5 + codexConfidence * 0.3 + relationshipConfidence * 0.2
  );
  const level: "low" | "medium" | "high" =
    totalConfidence >= 0.72 ? "high" : totalConfidence >= 0.4 ? "medium" : "low";
  return {
    certifiedFlags,
    currentFlags,
    recognitionCodexHints,
    issuerRelationshipHints,
    sourceConfidence: {
      flag: Number(flagConfidence.toFixed(2)),
      codex: Number(codexConfidence.toFixed(2)),
      relationship: Number(relationshipConfidence.toFixed(2)),
      total: Number(totalConfidence.toFixed(2)),
      level,
    },
  };
}

function buildProfessionSystemHints(args: {
  professionPacket: ReturnType<typeof parseProfessionPacket>;
  location: string | null;
  tasks: string[];
  threatPhase: MainThreatPhase;
  hasWeapon: boolean;
}): string[] {
  const p = args.professionPacket.currentProfession;
  if (!p) return ["未认证职业：优先通过任务与主威胁交互建立路线证据。"];
  if (p === "守灯人") {
    return [
      `守灯人提示：当前威胁相位=${args.threatPhase}，优先围绕压制窗口而非硬拼。`,
      "系统联动：main_threat_updates + sanity_damage + suppression windows。",
    ];
  }
  if (p === "巡迹客") {
    return [
      `巡迹客提示：当前位置=${args.location ?? "未知"}，优先规划进退路径并控制耗时。`,
      "系统联动：player_location + consumes_time + threat escalation。",
    ];
  }
  if (p === "觅兆者") {
    return [
      "觅兆者提示：优先补写 counterHintsUsed 或可验证前兆线索。",
      "系统联动：threat telegraph + codex_updates + task_updates。",
    ];
  }
  if (p === "齐日角") {
    return [
      `齐日角提示：当前活跃任务${args.tasks.length}条，优先关系分流而非正面冲突。`,
      "系统联动：relationship_updates + task_updates + codex(npc)。",
    ];
  }
  return [
    `溯源师提示：${args.hasWeapon ? "已装备主手武器，" : ""}优先串联锻造记录与图鉴证据链。`,
    "系统联动：weapon_updates + forge_packet + codex/truth flags。",
  ];
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
  const professionPacket = parseProfessionPacket(args.playerContext);
  const professionProgressPacket = parseProfessionProgressPacket(args.playerContext);
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
  const professionIdentityPacket = buildProfessionIdentityPacket({
    worldFlags,
    professionPacket,
    relationshipHints,
  });
  const threatPacket = buildThreatPacket({
    location,
    contextThreatMap: mainThreatMap,
  });
  const professionSystemHints = buildProfessionSystemHints({
    professionPacket,
    location,
    tasks,
    threatPhase: threatPacket.phase,
    hasWeapon: Boolean(equippedWeapon.weaponId),
  });

  const signals = parsePlayerWorldSignals(args.playerContext, args.playerLocation);
  const maxRevealRank = computeMaxRevealRankFromSignals(signals);
  const firedRevealRuleIds = listFiredRevealRuleIds(signals);
  const floorLore = getFloorLoreByLocation(location);
  const threatSnapshotForLore: ThreatSnapshot = {
    floorId: threatPacket.floorId,
    threatId: threatPacket.activeThreatId,
    threatName: threatPacket.activeThreatName,
    phase: threatPacket.phase,
    suppressionProgress: threatPacket.suppressionProgress,
  };
  const serviceKinds = services.map((svc) => svc.kind);
  const worldLorePackets = {
    reveal_tier_packet: buildRevealTierPacket({ signals, maxRevealRank, firedRuleIds: firedRevealRuleIds }),
    floor_lore_packet: buildFloorLorePacket({ signals, floorLore, maxRevealRank }),
    threat_lore_packet: buildThreatLorePacket({ threat: threatSnapshotForLore, floorLore, maxRevealRank }),
    b1_order_packet: buildB1OrderPacket({ signals, servicesAtLocation: serviceKinds }),
    revive_anchor_lore_packet: buildReviveAnchorLorePacket({
      signals,
      anchorUnlocks,
      revive,
      maxRevealRank,
    }),
    originium_economy_packet: buildOriginiumEconomyPacket({ signals, maxRevealRank }),
    key_npc_lore_packet: buildKeyNpcLorePacket({
      nearbyNpcIds,
      relationshipHints,
      worldFlags,
      maxRevealRank,
    }),
    recent_world_event_packet: buildRecentWorldEventPacket({
      worldFlags,
      revive,
      activeTaskTitles: signals.activeTaskTitles.length > 0 ? signals.activeTaskTitles : tasks,
    }),
  };
  const flFull = worldLorePackets.floor_lore_packet;
  const thFull = worldLorePackets.threat_lore_packet;
  const worldLorePacketsCompact = {
    reveal_tier_packet: worldLorePackets.reveal_tier_packet,
    floor_lore_packet: {
      floorId: flFull.floorId,
      publicTheme: flFull.publicTheme,
      publicOmen: flFull.publicOmen,
      digestionStage: flFull.digestionStage,
    },
    threat_lore_packet: {
      floorId: thFull.floorId,
      activeThreatId: thFull.activeThreatId,
      phase: thFull.phase,
      suppressionProgress: thFull.suppressionProgress,
    },
    b1_order_packet: {
      isB1: worldLorePackets.b1_order_packet.isB1,
      surfaceSnippet: worldLorePackets.b1_order_packet.surfaceSnippet,
    },
    revive_anchor_lore_packet: {
      hasRecentRevive: worldLorePackets.revive_anchor_lore_packet.hasRecentRevive,
      deathCount: worldLorePackets.revive_anchor_lore_packet.deathCount,
      anchors: worldLorePackets.revive_anchor_lore_packet.anchors,
    },
    originium_economy_packet: {
      originiumCount: worldLorePackets.originium_economy_packet.originiumCount,
      surfaceRumor: worldLorePackets.originium_economy_packet.surfaceRumor,
    },
    key_npc_lore_packet: {
      nearbyNpcIds: (worldLorePackets.key_npc_lore_packet.nearbyNpcIds as string[]).slice(0, 4),
    },
    recent_world_event_packet: {
      activeTaskTitles: (worldLorePackets.recent_world_event_packet.activeTaskTitles as string[]).slice(0, 3),
      flaggedEvents: (worldLorePackets.recent_world_event_packet.flaggedEvents as string[]).slice(0, 4),
    },
  };

  const weaponPacket = buildWeaponPacket({
    weapon: equippedWeapon,
    threatName: threatPacket.activeThreatName,
    threatId: threatPacket.activeThreatId,
  });
  const worldviewPacket = buildWorldviewPacket({
    location,
    threatPhase: threatPacket.phase,
    activeTasks: tasks,
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
    worldview_packet: worldviewPacket,
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
    profession_packet: professionPacket,
    profession_system_hints_packet: professionSystemHints,
    profession_progress_packet: professionProgressPacket,
    profession_identity_packet: professionIdentityPacket,
    tactical_context_packet: buildTacticalContextPacket({
      latestUserInput: args.latestUserInput,
      activeTasks: tasks,
      runtimeLoreHints: loreLines,
      nearbyNpcIds,
      threatPhase: threatPacket.phase,
      currentProfession: professionPacket.currentProfession,
    }),
    ...worldLorePackets,
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
    worldview_packet: packets.worldview_packet,
    weapon_packet: packets.weapon_packet,
    forge_packet: packets.forge_packet,
    floor_progression_packet: packets.floor_progression_packet,
    active_tasks_packet: packets.active_tasks_packet.slice(0, 4),
    anchor_revive_packet: packets.anchor_revive_packet,
    service_nodes_packet: {
      location: packets.service_nodes_packet.location,
      services: packets.service_nodes_packet.services.slice(0, 4),
    },
    profession_packet: packets.profession_packet,
    profession_system_hints_packet: packets.profession_system_hints_packet.slice(0, 4),
    profession_progress_packet: packets.profession_progress_packet.slice(0, 5),
    profession_identity_packet: packets.profession_identity_packet,
    tactical_context_packet: packets.tactical_context_packet,
    ...worldLorePacketsCompact,
  };
  const compactText = [
    "## 【运行时结构化上下文包（权威事实源）】",
    "你必须优先遵从以下 JSON packet；若与静态记忆冲突，以 packet 为准。",
    JSON.stringify(compactPackets),
  ].join("\n");
  return compactText.slice(0, maxChars);
}

