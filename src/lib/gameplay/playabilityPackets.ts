import { buildWorldFeelHooks } from "./worldFeelHooks";
import { inferTimePressure, isHotThreatPhase } from "./coreLoops";

export type SurvivalLoopPacketV1 = {
  version: 1;
  safeZone: boolean;
  timePressure: "low" | "mid" | "high";
  hotThreatPresent: boolean;
  weaponMaintenance: "ok" | "suggested" | "urgent" | "unavailable";
  nextReasons: string[];
  nextSuggestedActions: string[];
};

export type RelationshipLoopPacketV1 = {
  version: 1;
  promiseCount: number;
  activeTaskCount: number;
  debtPressure: "low" | "mid" | "high";
  certifierPresenceHint: string;
  nextReasons: string[];
  nextSuggestedActions: string[];
};

export type InvestigationLoopPacketV1 = {
  version: 1;
  codexNpcCount: number;
  codexAnomalyCount: number;
  hasHotThreat: boolean;
  nextReasons: string[];
  nextSuggestedActions: string[];
};

export function buildPlayabilityPacketsV1(args: {
  day: number | null;
  hour: number | null;
  locationId: string;
  safeZone: boolean;
  originium: number;
  weapon: { stability: number | null; contamination: number | null; repairable: boolean | null };
  mainThreatByFloor: Record<string, { phase: string; suppressionProgress: number }>;
  tasks: Array<{ id: string; layer?: string; status?: string }>;
  codex: { npcCount: number; anomalyCount: number };
  profession: { current: string | null; certifierSeen: boolean };
}): {
  survival_loop_packet: SurvivalLoopPacketV1;
  relationship_loop_packet: RelationshipLoopPacketV1;
  investigation_loop_packet: InvestigationLoopPacketV1;
  world_feel_extra_living_lines: string[];
} {
  const timePressure = inferTimePressure({ day: args.day, hour: args.hour });
  const hotThreatFloors = Object.entries(args.mainThreatByFloor ?? {})
    .filter(([, v]) => isHotThreatPhase(v.phase))
    .map(([k]) => k);
  const hotThreatPresent = hotThreatFloors.length > 0;
  const safeZone = Boolean(args.safeZone);
  const activeTasks = (args.tasks ?? []).filter((t) => t.status === "active" || t.status === "available");
  const promiseCount = (args.tasks ?? []).filter((t) => t.layer === "conversation_promise").length;

  const stability = typeof args.weapon.stability === "number" && Number.isFinite(args.weapon.stability) ? args.weapon.stability : 0;
  const contamination = typeof args.weapon.contamination === "number" && Number.isFinite(args.weapon.contamination) ? args.weapon.contamination : 0;
  const repairable = args.weapon.repairable === true;
  const weaponMaintenance: SurvivalLoopPacketV1["weaponMaintenance"] =
    !repairable ? "unavailable" :
      contamination >= 70 || stability < 50 ? "urgent" :
        contamination >= 40 || stability < 65 ? "suggested" : "ok";

  const survivalReasons: string[] = [];
  const survivalNext: string[] = [];
  if (safeZone) {
    survivalReasons.push("你在安全区，可以把“补给/维护/欠账”做成优势。");
    if (weaponMaintenance !== "ok") survivalNext.push("去配电间安排一次维护/修复，让武器回到可控区。");
    if (args.originium <= 1) survivalNext.push("先补给或接一单低风险委托，把原石周转起来。");
  } else {
    survivalReasons.push("你在危险区：每回合都在堆风险。");
    if (hotThreatPresent) survivalNext.push("优先确认主威胁相位与可用窗口，再决定压制/撤离。");
    if (weaponMaintenance === "urgent") survivalNext.push("别硬赌：回安全区或换对策再推进。");
  }
  if (timePressure === "high") survivalReasons.push("时间压力上升：拖延会让窗口越来越硬。");

  const relationshipReasons: string[] = [];
  const relationshipNext: string[] = [];
  const debtPressure: RelationshipLoopPacketV1["debtPressure"] =
    promiseCount >= 3 ? "high" : promiseCount >= 1 ? "mid" : "low";
  if (promiseCount > 0) relationshipReasons.push(`你身上有${promiseCount}条口头约定：它们会反噬或兑现。`);
  if (activeTasks.length > 0) relationshipReasons.push(`你有${activeTasks.length}条在推进的委托：人会盯着结果。`);
  const certifierPresenceHint = args.profession.certifierSeen
    ? "签发者已看见你：现在谈条件，比直接讨好更有效。"
    : "签发者未必在场：先用行动换来“被看见”。";
  relationshipNext.push("把一条承诺做成可验证结果（证据/交付/回报），换取下一步通融。");
  if (debtPressure !== "low") relationshipNext.push("别再空接：先清掉一条债再扩张关系面。");

  const invReasons: string[] = [];
  const invNext: string[] = [];
  invReasons.push(`图鉴：NPC ${args.codex.npcCount}，异常 ${args.codex.anomalyCount}。`);
  if (hotThreatPresent) invReasons.push("主威胁在动：现在做验证，收益更大。");
  if (args.codex.anomalyCount < 2) invNext.push("优先做一次“前兆验证”：把模糊恐惧变成可复述结论。");
  invNext.push("把一条线索写成可执行建议（去哪、找谁、用什么换）。");

  const livingLines = buildWorldFeelHooks({
    locationId: args.locationId,
    safeZone,
    weaponNeedsMaintenance: weaponMaintenance === "urgent" || weaponMaintenance === "suggested",
    hasHotThreat: hotThreatPresent,
    promiseCount,
  });

  return {
    survival_loop_packet: {
      version: 1,
      safeZone,
      timePressure,
      hotThreatPresent,
      weaponMaintenance,
      nextReasons: survivalReasons.slice(0, 4),
      nextSuggestedActions: survivalNext.slice(0, 4),
    },
    relationship_loop_packet: {
      version: 1,
      promiseCount,
      activeTaskCount: activeTasks.length,
      debtPressure,
      certifierPresenceHint,
      nextReasons: relationshipReasons.slice(0, 4),
      nextSuggestedActions: relationshipNext.slice(0, 4),
    },
    investigation_loop_packet: {
      version: 1,
      codexNpcCount: args.codex.npcCount,
      codexAnomalyCount: args.codex.anomalyCount,
      hasHotThreat: hotThreatPresent,
      nextReasons: invReasons.slice(0, 4),
      nextSuggestedActions: invNext.slice(0, 4),
    },
    world_feel_extra_living_lines: livingLines,
  };
}

