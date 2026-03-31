import type { StatType, Weapon } from "@/lib/registry/types";
import type { CodexEntry, GameTask } from "@/store/useGameStore";
import type { NpcHeartRuntimeView } from "@/lib/npcHeart/types";
import { buildSceneCombatContext } from "./sceneCombatContext";
import { buildHiddenNpcCombatProfile, computeCombatPrecheck, computeNpcCombatScore } from "./combatAdjudication";
import { computePlayerCombatScore } from "./playerCombatScore";
import { resolveNpcCombatStyle } from "./combatStyleResolvers";
import { dangerTierToPlayerText, styleTagsToPlayerHint } from "./combatPresentation";
import { NPCS } from "@/lib/registry/npcs";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import type { CombatConflictKind, CombatPrecheck, MainThreatPhase } from "./types";

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function floorIdFromLocation(locationId: string): string {
  const t = String(locationId ?? "");
  if (t.startsWith("B2_")) return "B2";
  if (t.startsWith("B1_")) return "B1";
  const m = t.match(/^(\d)F_/);
  return m?.[1] ?? "unknown";
}

function threatPhaseForFloor(mainThreatByFloor: Record<string, any> | null | undefined, floorId: string): MainThreatPhase {
  const m = mainThreatByFloor ?? {};
  const hit = Object.values(m).find((x: any) => x && String(x.floorId ?? "") === String(floorId));
  const phase = String((hit as any)?.phase ?? "idle");
  return phase === "idle" || phase === "active" || phase === "suppressed" || phase === "breached" ? (phase as any) : "idle";
}

export function detectConflictLikelihood(args: {
  lastUserInput: string;
  locationId: string;
  mainThreatByFloor?: Record<string, unknown>;
  npcHeartViews?: NpcHeartRuntimeView[];
}): { likely: boolean; reasons: string[]; kindHint: CombatConflictKind } {
  const text = String(args.lastUserInput ?? "");
  const reasons: string[] = [];

  const verbHit =
    /打|揍|砍|刺|杀|弄死|制服|按住|扭住|推开|踹|拔刀|开打|动手|威胁|勒索|掐|逃|跑|撤|躲|冲出去|撞开/.test(text);
  if (verbHit) reasons.push("玩家输入带明显冲突意图");

  const hostileNpc = (args.npcHeartViews ?? []).some((v) => v.attitudeLabel === "hostile");
  if (hostileNpc) reasons.push("同场存在敌对 NPC");

  const floorId = floorIdFromLocation(args.locationId);
  const phase = threatPhaseForFloor(args.mainThreatByFloor as any, floorId);
  const hot = phase === "active" || phase === "breached";
  if (hot && floorId !== "B1") reasons.push("高压相位且非安全区");

  const likely = reasons.length >= 1 && (verbHit || hostileNpc || (hot && floorId !== "B1"));
  const kindHint: CombatConflictKind =
    /逃|跑|撤|躲|冲出去/.test(text) ? "escape" :
    /威胁|逼|恐吓|勒索/.test(text) ? "intimidate" :
    /推开|踹|按住|制服|扭住/.test(text) ? "subdue" :
    /砍|刺|拔刀/.test(text) ? "weapon_clash" :
    "subdue";
  return { likely, reasons: reasons.slice(0, 3), kindHint };
}

function pickPrimaryConflictNpc(views: NpcHeartRuntimeView[]): NpcHeartRuntimeView | null {
  const hostile = views.find((v) => v.attitudeLabel === "hostile");
  if (hostile) return hostile;
  const major = views.find((v) => v.profile.charmTier === "major_charm");
  return major ?? views[0] ?? null;
}

function inferKnowsWeakness(entry: CodexEntry | null | undefined): boolean {
  const w = typeof entry?.weakness === "string" ? entry!.weakness.trim() : "";
  return w.length >= 2;
}

/**
 * Combat prompt block（V1）
 * - 小、强约束、面向“冲突回合”
 * - 不改变 DM JSON 契约：只影响 narrative 的写法与裁决锚点
 */
export function buildCombatPromptBlockV1(args: {
  lastUserInput: string;
  locationId: string;
  time?: { day: number; hour: number } | null;
  mainThreatByFloor?: Record<string, unknown>;
  tasks?: GameTask[];
  stats: Record<StatType, number> | null | undefined;
  equippedWeapon?: Weapon | null;
  codex?: Record<string, CodexEntry>;
  npcHeartViews?: NpcHeartRuntimeView[];
  maxChars?: number;
}): string {
  const maxChars = Math.max(180, Math.min(700, args.maxChars ?? 420));
  const locationId = String(args.locationId ?? "").trim() || "unknown";
  const floorId = floorIdFromLocation(locationId);
  const threatPhase = threatPhaseForFloor(args.mainThreatByFloor as any, floorId);
  const scene = buildSceneCombatContext({ locationId, threatPhase, time: args.time as any });

  const views = (args.npcHeartViews ?? []).slice(0, 3);
  const detect = detectConflictLikelihood({
    lastUserInput: args.lastUserInput,
    locationId,
    mainThreatByFloor: args.mainThreatByFloor,
    npcHeartViews: views,
  });
  if (!detect.likely || views.length === 0) return "";

  const focus = pickPrimaryConflictNpc(views);
  if (!focus) return "";

  const npcId = focus.profile.npcId;
  const codexEntry = (args.codex ?? {})[npcId] ?? null;
  const npcHidden = buildHiddenNpcCombatProfile({ npcId, codex: args.codex ?? null });
  const npcScore = computeNpcCombatScore({ npc: npcHidden, scene });
  const playerScore = computePlayerCombatScore({
    stats: args.stats,
    equippedWeapon: args.equippedWeapon ?? null,
    threatPhase,
    knowsWeakness: inferKnowsWeakness(codexEntry),
    allyCount: 0,
    initiative: /偷袭|趁其不备|背后|突然/.test(args.lastUserInput) ? "soft" : "none",
    footingQuality: scene.isSafeZone ? "good" : "ok",
  });

  const pre: CombatPrecheck = computeCombatPrecheck({
    attacker: playerScore,
    defender: npcScore,
    defenderDangerForPlayer: npcHidden.dangerForPlayer,
    scene,
    kind: detect.kindHint,
  });

  const npcRow = NPCS.find((x) => x.id === npcId) ?? null;
  const profileV2 = CORE_NPC_PROFILES_V2.find((p) => p.id === npcId) ?? null;
  const style = resolveNpcCombatStyle({
    npcId,
    npcProfileV2: profileV2,
    npcRegistryRow: npcRow,
    codexEntry,
    hiddenProfile: npcHidden,
  });

  const dangerText = dangerTierToPlayerText(pre.dangerForPlayer);
  const styleHint = styleTagsToPlayerHint(npcHidden.styleTags);

  const lines: string[] = [];
  lines.push("## 【冲突回合·战斗裁决锚（V1）】");
  lines.push("写法目标：短促、近身、局部异能、空间压迫；把胜负写成“窗口与代价”，不是技能秀。");
  lines.push("禁止：大范围爆炸/毁天灭地/超高速连闪/血条大战/光炮大招。破坏尺度仅限房间/走廊/楼梯间/门厅与局部器物。");
  lines.push(`触发原因：${detect.reasons.join("；")}`);
  lines.push(`焦点：${npcHidden.displayName}（危险印象：${dangerText}${styleHint ? ` · ${styleHint}` : ""}）`);
  lines.push(`压制倾向：${pre.verdict === "avoid" ? "对方压你（别硬顶）" : pre.verdict === "risky" ? "对方偏压你（代价高）" : pre.verdict === "contested" ? "势均力敌（一步窗口）" : "你更易压住局面"}`);
  lines.push(`为什么：${clampText(pre.explain.slice(0, 2).join("；"), 120)}`);
  lines.push(`环境参与：${clampText(scene.notes.slice(0, 2).join("；"), 120)}`);
  lines.push(`风格：${style.def.label}｜压迫源=${clampText(style.def.pressureSource.slice(0, 2).join("；"), 80)}`);
  lines.push(`招牌拍子：${clampText(style.def.signatureBeats.slice(0, 2).join("；"), 90)}`);
  lines.push("冲突后局势：必须落到‘谁退了半步/谁丢了位置/谁获得退路或被卡退路/代价轻重’，不要空喊‘你赢了/他很强’。");

  return clampText(lines.join("\n"), maxChars);
}

