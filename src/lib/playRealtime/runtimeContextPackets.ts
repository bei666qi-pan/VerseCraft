import { getFloorLoreByLocation } from "@/lib/registry/floorLoreRegistry";
import { computeMaxRevealRankFromSignals, listFiredRevealRuleIds } from "@/lib/registry/revealRegistry";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { buildCycleTimePacket, buildCycleTimePacketCompact } from "@/lib/registry/cycleMoonFlashRegistry";
import {
  buildSchoolCycleExperiencePacket,
  buildSchoolCycleExperiencePacketCompact,
} from "@/lib/registry/playerExperienceSchoolCycleRegistry";
import { MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import {
  buildMajorNpcForeshadowPacket,
  buildMajorNpcForeshadowPacketCompact,
} from "@/lib/registry/majorNpcForeshadowRegistry";
import { getServicesForLocation } from "@/lib/registry/serviceNodes";
import {
  buildB1OrderPacket,
  buildFloorLorePacket,
  buildKeyNpcLorePacket,
  buildMajorNpcRelinkPacket,
  buildMajorNpcRelinkPacketCompact,
  buildOriginiumEconomyPacket,
  buildRecentWorldEventPacket,
  buildReviveAnchorLorePacket,
  buildRevealTierPacket,
  buildSpaceAuthorityBaselinePacket,
  buildSpaceAuthorityBaselinePacketCompact,
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
import {
  buildSchoolCycleArcPacket,
  buildSchoolCycleArcPacketCompact,
  buildSchoolCycleArcPacketMicro,
} from "@/lib/registry/schoolCycleCanon";
import {
  buildCycleLoopPacket,
  buildCycleLoopPacketCompact,
  buildMajorNpcArcPacket,
  buildMajorNpcArcPacketCompact,
  buildSchoolSourcePacket,
  buildSchoolSourcePacketCompact,
  buildTeamRelinkPacket,
  buildTeamRelinkPacketCompact,
} from "@/lib/registry/worldSchoolRuntimePackets";
import type { ThreatSnapshot } from "./stage2Packets";
import { buildEmptyNpcPlayerBaselinePacket, buildNpcPlayerBaselinePacket } from "@/lib/npcBaselineAttitude/builders";
import {
  buildNpcSceneAuthority,
  compactNpcSceneAuthorityPacket,
  extractMentionedNpcIdsFromUserInput,
  extractNpcIdsFromRelationshipHints,
} from "@/lib/npcSceneAuthority/builders";
import {
  buildActorConstraintBundle,
  compactActorConstraintBundle,
  parseRtTaskLayers,
} from "@/lib/playRealtime/actorConstraintPackets";
import { buildNpcSocialSurfacePacketCompact } from "@/lib/playRealtime/npcSocialSurfacePackets";
import { buildNewPlayerGuidePacket } from "@/lib/playRealtime/newPlayerGuidePackets";
import { buildWorldFeelPacket } from "@/lib/playRealtime/worldFeelPackets";
import { buildPlayabilityPacketsV1 } from "@/lib/gameplay/playabilityPackets";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import {
  incrMonthStartStudentRecognitionHitCount,
  incrNewPlayerGuideDualCoreHitCount,
  incrNpcSocialSurfaceUsageCount,
  incrWorldFeelPacketUsageCount,
  incrSurvivalLoopPacketUsageCount,
  incrRelationshipLoopPacketUsageCount,
  incrInvestigationLoopPacketUsageCount,
} from "@/lib/observability/versecraftRolloutMetrics";

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
const SCENE_APPEAR_RE = /场景外貌已描写：([^。]+)。/;
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

function parseCodexCounts(playerContext: string): { npcCount: number; anomalyCount: number } {
  const raw = playerContext.match(CODEX_RE)?.[1]?.trim();
  if (!raw) return { npcCount: 0, anomalyCount: 0 };
  let npcCount = 0;
  let anomalyCount = 0;
  for (const part of raw.split("，").map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/\[([a-zA-Z_]+)\|/);
    const t = (m?.[1] ?? "").trim();
    if (t === "npc") npcCount += 1;
    if (t === "anomaly") anomalyCount += 1;
  }
  return { npcCount, anomalyCount };
}

function parseSceneNpcAppearanceWritten(playerContext: string): string[] {
  const raw = playerContext.match(SCENE_APPEAR_RE)?.[1]?.trim();
  if (!raw || raw === "无") return [];
  return raw
    .split("/")
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
      "系统联动：player_location + consumes_time/time_cost（小时分数）+ threat escalation。",
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

function parsePendingHourFractionFromContext(playerContext: string): number {
  const m = playerContext.match(/【小时余量】([0-9]+(?:\.[0-9]+)?)/);
  if (!m?.[1]) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function buildRuntimeContextPackets(args: {
  playerContext: string;
  latestUserInput: string;
  playerLocation: string | null;
  serviceState?: ServiceStateInput;
  runtimeLoreCompact?: string;
  maxChars?: number;
  contextMode?: "minimal" | "full";
  /** 优先用于 npc_player_baseline_packet；须在同场景 nearby 列表内 */
  focusNpcId?: string | null;
}): string {
  const location = parseLocation(args.playerContext, args.playerLocation);
  const time = parseTime(args.playerContext);
  const worldFlags = parseWorldFlags(args.playerContext);
  const anchorUnlocks = parseAnchorState(args.playerContext);
  const revive = parseRevive(args.playerContext);
  const tasks = parseTasks(args.playerContext);
  const npcPositions = parseNpcPositions(args.playerContext);
  const relationshipHints = parseRelationshipHints(args.playerContext);
  const codexCounts = parseCodexCounts(args.playerContext);
  const sceneNpcAppearanceWritten = parseSceneNpcAppearanceWritten(args.playerContext);
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
  const rollout = getVerseCraftRolloutFlags();
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
  const pendingHourFraction = parsePendingHourFractionFromContext(args.playerContext);
  const timeRhythmHints =
    pendingHourFraction > 0.02
      ? [
          `时间节律：本游戏小时内已累积约 ${Math.round(pendingHourFraction * 100)}%（未进位）。短试探可设 time_cost=light；单场景完整推进用 standard；跨层移动/正式服务/危机用 heavy 或 dangerous；叙事占位但不走表观时钟可用 consumes_time=false 或 time_cost=free。`,
        ]
      : [];
  const professionSystemHints = [
    ...timeRhythmHints,
    ...buildProfessionSystemHints({
      professionPacket,
      location,
      tasks,
      threatPhase: threatPacket.phase,
      hasWeapon: Boolean(equippedWeapon.weaponId),
    }),
  ];

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
  const majorNpcRelinkPacket = buildMajorNpcRelinkPacket({
    playerContext: args.playerContext,
    signals,
    nearbyNpcIds,
    maxRevealRank,
  });
  const majorNpcRelinkPacketCompact = buildMajorNpcRelinkPacketCompact(majorNpcRelinkPacket);
  const majorNpcArcPacket = buildMajorNpcArcPacket({
    nearbyNpcIds,
    maxRevealRank,
    relinkEntries: majorNpcRelinkPacket.entries,
  });
  const cycleLoopPacket = buildCycleLoopPacket(maxRevealRank, signals);
  const nearbyMajorForCycle = nearbyNpcIds.filter((id): id is MajorNpcId =>
    MAJOR_NPC_IDS.includes(id as MajorNpcId)
  );
  const majorNpcForeshadowPacket = buildMajorNpcForeshadowPacket({
    nearbyMajorNpcIds: nearbyMajorForCycle,
    maxRevealRank,
    day: time.day && time.day > 0 ? time.day : 1,
    ctx: {
      activeTaskTitles: signals.activeTaskTitles,
      worldFlags,
      locationNode: location,
      hotThreatPresent: threatPacket.phase === "active" || threatPacket.phase === "breached",
    },
  });
  const cycleTimePacket = buildCycleTimePacket({
    signals,
    nearbyMajorNpcIds: nearbyMajorForCycle,
    maxRevealRank,
  });
  const schoolCycleExperiencePacket = buildSchoolCycleExperiencePacket({
    signals,
    nearbyMajorNpcIds: nearbyMajorForCycle,
    maxRevealRank,
  });
  const schoolSourcePacket = buildSchoolSourcePacket(maxRevealRank);
  const teamRelinkPacket = buildTeamRelinkPacket({ majorNpcRelinkPacket, nearbyNpcIds });
  const focusRaw = args.focusNpcId?.trim() ?? "";
  const focusNpcForBaseline =
    focusRaw && nearbyNpcIds.includes(focusRaw) ? focusRaw : (nearbyNpcIds[0] ?? null);
  const npcPlayerBaselinePacket = focusNpcForBaseline
    ? buildNpcPlayerBaselinePacket({
        npcId: focusNpcForBaseline,
        relationPartial: {},
        scene: {
          locationId: location ?? "unknown",
          hotThreatPresent: threatPacket.phase === "active" || threatPacket.phase === "breached",
          maxRevealRank,
        },
      })
    : buildEmptyNpcPlayerBaselinePacket();
  const mentionedNpcIdsFromInput = extractMentionedNpcIdsFromUserInput(args.latestUserInput);
  const codexNpcIdsFromHints = extractNpcIdsFromRelationshipHints(relationshipHints);
  const npcSceneAuthorityPacket = buildNpcSceneAuthority({
    currentSceneLocation: location,
    npcPositions,
    sceneAppearanceAlreadyWrittenIds: sceneNpcAppearanceWritten,
    mentionedNpcIdsFromInput,
    codexOrHintNpcIds: codexNpcIdsFromHints,
    maxRevealRank,
  });
  const actorConstraintBundle = buildActorConstraintBundle({
    playerContext: args.playerContext,
    latestUserInput: args.latestUserInput,
    focusNpcId: focusNpcForBaseline,
    location: location ?? "B1_SafeZone",
    maxRevealRank,
    hotThreatPresent: threatPacket.phase === "active" || threatPacket.phase === "breached",
    activeTaskIds: parseRtTaskLayers(args.playerContext)
      .map((x) => x.taskId)
      .filter((id) => typeof id === "string" && id.trim().length > 0)
      .slice(0, 16),
    pendingHourFraction,
    presentNpcIds: nearbyNpcIds,
  });
  const actorConstraintCompact = compactActorConstraintBundle(actorConstraintBundle);
  const spaceAuthorityBaselinePacket = rollout.enableSpaceAuthorityCanon
    ? buildSpaceAuthorityBaselinePacket({
        maxRevealRank,
        nearbyNpcIds,
      })
    : {
        schema: "space_authority_baseline_v1",
        rolloutDisabled: true,
        note: "VERSECRAFT_ENABLE_SPACE_AUTHORITY_CANON=false",
      };
  const npcSocialSurfacePacket = rollout.enableNpcSocialSurface
    ? buildNpcSocialSurfacePacketCompact(nearbyNpcIds, 4)
    : null;
  if (npcSocialSurfacePacket) incrNpcSocialSurfaceUsageCount(1);
  const playerWorldEntryPacket = rollout.enableWorldEntryPackets
    ? {
        schema: "player_world_entry_v1",
        authorityLabel: "space",
        unifiedShardLabel: "空间权柄碎片（校源与公寓叙事切口统一在权柄之下）",
        monthlyIntrusionStudent: rollout.enableMonthlyStudentEntry,
      }
    : null;
  const newPlayerGuidePacket = rollout.enableNewPlayerGuideDualCoreV2
    ? buildNewPlayerGuidePacket({
        playerContext: args.playerContext,
        playerLocation: location,
        clientState: null,
      })
    : null;
  if (newPlayerGuidePacket?.enabled) incrNewPlayerGuideDualCoreHitCount(1);

  const worldFeelPacket = rollout.enableWorldFeelPackets
    ? buildWorldFeelPacket({
        locationId: location,
        day: time.day && time.day > 0 ? time.day : 1,
        hour: time.hour && time.hour >= 0 ? time.hour : 0,
        maxRevealRank,
        monthlyStudentEntryEnabled: rollout.enableMonthStartStudentWorldlogic && rollout.enableMonthlyStudentEntry,
        nearbyNpcIds,
        serviceKinds,
      })
    : null;
  if (worldFeelPacket) {
    incrWorldFeelPacketUsageCount(1);
    if (worldFeelPacket.month_start_pressure.enabled) incrMonthStartStudentRecognitionHitCount(1);
  }
  const worldLorePackets = {
    reveal_tier_packet: buildRevealTierPacket({ signals, maxRevealRank, firedRuleIds: firedRevealRuleIds }),
    space_authority_baseline_packet: spaceAuthorityBaselinePacket,
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
    major_npc_arc_packet: majorNpcArcPacket,
    cycle_loop_packet: cycleLoopPacket,
    cycle_time_packet: cycleTimePacket,
    school_cycle_experience_packet: schoolCycleExperiencePacket,
    school_source_packet: schoolSourcePacket,
    major_npc_foreshadow_packet: majorNpcForeshadowPacket,
    team_relink_packet: teamRelinkPacket,
  };
  const originiumCount =
    typeof worldLorePackets.originium_economy_packet.originiumCount === "number"
      ? worldLorePackets.originium_economy_packet.originiumCount
      : 0;

  const playability = rollout.enablePlayabilityCoreLoopsV1
    ? buildPlayabilityPacketsV1({
        day: time.day,
        hour: time.hour,
        locationId: location ?? "unknown",
        safeZone: Boolean(location && location.startsWith("B1_")),
        originium: originiumCount,
        weapon: {
          stability: equippedWeapon.stability,
          contamination: equippedWeapon.contamination,
          repairable: equippedWeapon.repairable,
        },
        mainThreatByFloor: Object.fromEntries(
          Object.entries(mainThreatMap).map(([k, v]) => [k, { phase: v.phase, suppressionProgress: v.suppressionProgress }])
        ),
        tasks: parseRtTaskLayers(args.playerContext).map((x) => ({ id: x.taskId, layer: x.layer, status: "active" })),
        codex: codexCounts,
        profession: {
          current: professionPacket.currentProfession,
          certifierSeen:
            worldFlags.some((x) => x.startsWith("profession.observed.")) ||
            professionIdentityPacket.issuerRelationshipHints.length > 0,
        },
      })
    : {
        survival_loop_packet: {
          version: 1,
          safeZone: Boolean(location && location.startsWith("B1_")),
          timePressure: "low",
          hotThreatPresent: threatPacket.phase === "active" || threatPacket.phase === "breached",
          weaponMaintenance: "ok",
          nextReasons: [],
          nextSuggestedActions: [],
        },
        relationship_loop_packet: {
          version: 1,
          promiseCount: 0,
          activeTaskCount: tasks.length,
          debtPressure: "low",
          certifierPresenceHint: "",
          nextReasons: [],
          nextSuggestedActions: [],
        },
        investigation_loop_packet: {
          version: 1,
          codexNpcCount: codexCounts.npcCount,
          codexAnomalyCount: codexCounts.anomalyCount,
          hasHotThreat: threatPacket.phase === "active" || threatPacket.phase === "breached",
          nextReasons: [],
          nextSuggestedActions: [],
        },
        world_feel_extra_living_lines: [],
      };
  if (rollout.enablePlayabilityCoreLoopsV1) {
    incrSurvivalLoopPacketUsageCount(1);
    incrRelationshipLoopPacketUsageCount(1);
    incrInvestigationLoopPacketUsageCount(1);
  }
  const worldFeelPacketMerged =
    rollout.enableWorldFeelLoopPackets && worldFeelPacket && playability.world_feel_extra_living_lines.length > 0
      ? {
          ...worldFeelPacket,
          living_surface: {
            ...worldFeelPacket.living_surface,
            living_lines: Array.from(
              new Set([...worldFeelPacket.living_surface.living_lines, ...playability.world_feel_extra_living_lines])
            ).slice(0, 6),
          },
        }
      : worldFeelPacket;
  const flFull = worldLorePackets.floor_lore_packet;
  const thFull = worldLorePackets.threat_lore_packet;
  const schoolCycleArcPacketCompact = buildSchoolCycleArcPacketCompact(maxRevealRank);
  const schoolCycleArcPacketMicro = buildSchoolCycleArcPacketMicro(maxRevealRank);
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
      nearbyNpcBriefs: (worldLorePackets.key_npc_lore_packet.nearbyNpcBriefs as unknown[] | undefined)?.slice(0, 3),
      major_npc_bridge_hints: (
        worldLorePackets.key_npc_lore_packet.major_npc_bridge_hints as unknown[] | undefined
      )?.slice(0, 2),
    },
    recent_world_event_packet: {
      activeTaskTitles: (worldLorePackets.recent_world_event_packet.activeTaskTitles as string[]).slice(0, 3),
      flaggedEvents: (worldLorePackets.recent_world_event_packet.flaggedEvents as string[]).slice(0, 4),
    },
    major_npc_relink_packet: {
      schema: majorNpcRelinkPacketCompact.schema,
      xinlanPivotOpen: majorNpcRelinkPacketCompact.xinlanPivotOpen,
      crisisJoinWindowActive: majorNpcRelinkPacketCompact.crisisJoinWindowActive,
      xinlanPh: majorNpcRelinkPacketCompact.xinlanPh,
      rows: majorNpcRelinkPacketCompact.rows.slice(0, 6),
    },
    major_npc_arc_packet: buildMajorNpcArcPacketCompact(majorNpcArcPacket),
    cycle_loop_packet: buildCycleLoopPacketCompact(cycleLoopPacket),
    cycle_time_packet: buildCycleTimePacketCompact(cycleTimePacket),
    school_cycle_experience_packet: buildSchoolCycleExperiencePacketCompact(schoolCycleExperiencePacket),
    school_source_packet: buildSchoolSourcePacketCompact(schoolSourcePacket),
    major_npc_foreshadow_packet: buildMajorNpcForeshadowPacketCompact(majorNpcForeshadowPacket),
    team_relink_packet: buildTeamRelinkPacketCompact(teamRelinkPacket),
    space_authority_baseline_packet: rollout.enableSpaceAuthorityCanon
      ? buildSpaceAuthorityBaselinePacketCompact({
          maxRevealRank,
          nearbyNpcIds,
        })
      : { schema: "space_authority_baseline_compact_v1", rolloutDisabled: true },
    ...(npcSocialSurfacePacket ? { npc_social_surface_packet: npcSocialSurfacePacket } : {}),
  };

  const weaponPacket = buildWeaponPacket({
    weapon: equippedWeapon,
    threatName: threatPacket.activeThreatName,
    threatId: threatPacket.activeThreatId,
  });
  const schoolCycleArcPacket = buildSchoolCycleArcPacket(maxRevealRank);
  const worldviewPacket = buildWorldviewPacket({
    location,
    threatPhase: threatPacket.phase,
    activeTasks: tasks,
    maxRevealRank,
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
    school_cycle_arc_packet: schoolCycleArcPacket,
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
    ...(rollout.enablePlayabilityCoreLoopsV1
      ? {
          survival_loop_packet: playability.survival_loop_packet,
          relationship_loop_packet: playability.relationship_loop_packet,
          investigation_loop_packet: playability.investigation_loop_packet,
        }
      : {}),
    tactical_context_packet: buildTacticalContextPacket({
      latestUserInput: args.latestUserInput,
      activeTasks: tasks,
      runtimeLoreHints: loreLines,
      nearbyNpcIds,
      threatPhase: threatPacket.phase,
      currentProfession: professionPacket.currentProfession,
    }),
    scene_npc_appearance_written_packet: sceneNpcAppearanceWritten,
    major_npc_relink_packet: majorNpcRelinkPacket,
    npc_player_baseline_packet: npcPlayerBaselinePacket,
    npc_scene_authority_packet: npcSceneAuthorityPacket,
    ...actorConstraintBundle,
    ...worldLorePackets,
    ...(npcSocialSurfacePacket ? { npc_social_surface_packet: npcSocialSurfacePacket } : {}),
    ...(playerWorldEntryPacket ? { player_world_entry_packet: playerWorldEntryPacket } : {}),
    ...(newPlayerGuidePacket ? { new_player_guide_packet: newPlayerGuidePacket } : {}),
    ...(worldFeelPacketMerged ? { world_feel_packet: worldFeelPacketMerged } : {}),
  };
  const contextMode = args.contextMode ?? "full";
  const packetsForPrompt =
    contextMode === "minimal"
      ? {
          // 首字必需：地点/主威胁/当前任务/关键NPC/职业状态，避免世界观错位。
          current_location_packet: packets.current_location_packet,
          main_threat_packet: packets.main_threat_packet,
          active_tasks_packet: packets.active_tasks_packet.slice(0, 3),
          nearby_npc_packet: packets.nearby_npc_packet.slice(0, 4),
          profession_packet: packets.profession_packet,
          tactical_context_packet: packets.tactical_context_packet,
          ...(rollout.enablePlayabilityCoreLoopsV1
            ? {
                survival_loop_packet: (packets as any).survival_loop_packet,
                relationship_loop_packet: (packets as any).relationship_loop_packet,
                investigation_loop_packet: (packets as any).investigation_loop_packet,
              }
            : {}),
          scene_npc_appearance_written_packet: packets.scene_npc_appearance_written_packet,
          npc_player_baseline_packet: packets.npc_player_baseline_packet,
          npc_scene_authority_packet: compactNpcSceneAuthorityPacket(npcSceneAuthorityPacket),
          ...actorConstraintCompact,
          school_cycle_arc_packet: schoolCycleArcPacketCompact,
          ...worldLorePacketsCompact,
          ...(newPlayerGuidePacket ? { new_player_guide_packet: newPlayerGuidePacket } : {}),
          ...(worldFeelPacketMerged ? { world_feel_packet: worldFeelPacketMerged } : {}),
        }
      : packets;
  const text = [
    "## 【运行时结构化上下文包（权威事实源）】",
    "你必须优先遵从以下 JSON packet；若与静态记忆冲突，以 packet 为准。",
    JSON.stringify(packetsForPrompt),
  ].join("\n");
  /** full 默认预算：学制/高魅力子包加入后 compact 串常 >3k；过低会导致 slice 切掉 stage2 战术键 */
  const modeDefaultMax = contextMode === "minimal" ? 1400 : 4200;
  const maxChars = args.maxChars && args.maxChars > 300 ? args.maxChars : modeDefaultMax;
  if (text.length <= maxChars) return text;
  const compactPackets = {
    current_location_packet: packets.current_location_packet,
    main_threat_packet: packets.main_threat_packet,
    /** 阶段4：三主循环（优先靠前，避免 budget slice 截断丢失） */
    ...(rollout.enablePlayabilityCoreLoopsV1
      ? {
          survival_loop_packet: (packets as any).survival_loop_packet,
          relationship_loop_packet: (packets as any).relationship_loop_packet,
          investigation_loop_packet: (packets as any).investigation_loop_packet,
        }
      : {}),
    /** 截断路径下优先保留武器/锻造/战术上下文（原在 JSON 尾部易被 slice 截断） */
    weapon_packet: packets.weapon_packet,
    forge_packet: packets.forge_packet,
    tactical_context_packet: packets.tactical_context_packet,
    school_cycle_arc_packet: schoolCycleArcPacketMicro,
    ...worldLorePacketsCompact,
    worldview_packet: packets.worldview_packet,
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
    scene_npc_appearance_written_packet: packets.scene_npc_appearance_written_packet,
    npc_player_baseline_packet: {
      npcId: npcPlayerBaselinePacket.npcId,
      mergedViewOfPlayer: npcPlayerBaselinePacket.mergedViewOfPlayer,
      baselineViewOfPlayer: npcPlayerBaselinePacket.baselineViewOfPlayer,
      canShowFamiliarity: npcPlayerBaselinePacket.canShowFamiliarity,
      avoidMisalignment: npcPlayerBaselinePacket.avoidMisalignment.slice(0, 2),
      crisisResponseStyle: npcPlayerBaselinePacket.crisisResponseStyle.slice(0, 100),
      truthRevealCeiling: npcPlayerBaselinePacket.truthRevealCeiling,
      baselineVersusRelationNote: npcPlayerBaselinePacket.baselineVersusRelationNote.slice(0, 100),
      playerAddressCue: npcPlayerBaselinePacket.playerAddressCue.slice(0, 56),
      playerInteractionStanceCue: npcPlayerBaselinePacket.playerInteractionStanceCue.slice(0, 56),
    },
    npc_scene_authority_packet: compactNpcSceneAuthorityPacket(npcSceneAuthorityPacket),
    ...actorConstraintCompact,
    ...(npcSocialSurfacePacket ? { npc_social_surface_packet: npcSocialSurfacePacket } : {}),
    ...(playerWorldEntryPacket ? { player_world_entry_packet: playerWorldEntryPacket } : {}),
    ...(newPlayerGuidePacket ? { new_player_guide_packet: newPlayerGuidePacket } : {}),
    ...(worldFeelPacketMerged ? { world_feel_packet: worldFeelPacketMerged } : {}),
  };
  const compactText = [
    "## 【运行时结构化上下文包（权威事实源）】",
    "你必须优先遵从以下 JSON packet；若与静态记忆冲突，以 packet 为准。",
    JSON.stringify(compactPackets),
  ].join("\n");
  return compactText.slice(0, maxChars);
}

/**
 * 供 npc_consistency_boundary_compact 等复用：从 playerContext 解析 NPC/场景原语，避免与运行时大包逻辑分叉。
 */
export function parseRuntimeNpcPrimitives(playerContext: string, fallbackLocation: string | null) {
  return {
    location: parseLocation(playerContext, fallbackLocation),
    npcPositions: parseNpcPositions(playerContext),
    sceneNpcAppearanceWritten: parseSceneNpcAppearanceWritten(playerContext),
    relationshipHints: parseRelationshipHints(playerContext),
    mainThreatMap: parseMainThreatMap(playerContext),
  };
}

