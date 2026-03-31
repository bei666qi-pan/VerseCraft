import type { Weapon } from "@/lib/registry/types";
import type { CodexEntry } from "@/store/useGameStore";
import type { NpcHeartRuntimeView } from "@/lib/npcHeart/types";
import { buildSceneCombatContext } from "./sceneCombatContext";
import { buildHiddenNpcCombatProfile } from "./combatAdjudication";
import { resolveNpcCombatStyle } from "./combatStyleResolvers";
import { styleTagsToPlayerHint } from "./combatPresentation";
import type { MainThreatPhase, SceneCombatContext } from "./types";
import { NPCS } from "@/lib/registry/npcs";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";

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

function weaponLine(weapon: Weapon | null | undefined): string {
  if (!weapon) return "武器：未装备（更依赖走位与退路）。";
  const st = Number.isFinite((weapon as any).stability) ? Number((weapon as any).stability) : null;
  const cont = Number.isFinite((weapon as any).contamination) ? Number((weapon as any).contamination) : null;
  const tags = Array.isArray((weapon as any).counterTags) ? ((weapon as any).counterTags as string[]).slice(0, 3) : [];
  return `武器：${weapon.name}（${[st !== null ? `稳${Math.trunc(st)}` : "", cont !== null ? `污${Math.trunc(cont)}` : "", tags.length ? `tag:${tags.join("/")}` : ""].filter(Boolean).join("，")}）`;
}

/**
 * 战斗风格 prompt block（V1）
 * - 目的：把“微异能 + 空间压迫 + 破坏尺度控制 + 人格延伸”变成结构化约束
 * - 注意：这是写作约束块，不是玩家 UI；不暴露裸战力，不写成数值面板
 */
export function buildCombatNarrativeStyleBlock(args: {
  locationId: string;
  time?: { day: number; hour: number } | null;
  mainThreatByFloor?: Record<string, unknown>;
  codex?: Record<string, CodexEntry>;
  equippedWeapon?: Weapon | null;
  npcHeartViews?: NpcHeartRuntimeView[];
  maxChars?: number;
}): string {
  const maxChars = Math.max(140, Math.min(900, args.maxChars ?? 520));
  const locationId = String(args.locationId ?? "").trim() || "unknown";
  const floorId = floorIdFromLocation(locationId);
  const threatPhase = threatPhaseForFloor(args.mainThreatByFloor as any, floorId);
  const scene: SceneCombatContext = buildSceneCombatContext({ locationId, threatPhase, time: args.time as any });

  const views = (args.npcHeartViews ?? []).slice(0, 3);
  if (views.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 【战斗风格约束（V1·写作用）】");
  lines.push("总则：允许微奇幻/微异能，但必须是局部失真、局部异常；破坏尺度只到房间/走廊/楼梯间/门厅与局部器物。");
  lines.push("禁止：毁天灭地、整层爆炸、光炮大招、超高速连闪、血条技能轮换式数值战。");
  lines.push(`场景：${floorId}｜相位=${scene.threatPhase}｜${scene.timeOfDay === "night" ? "夜" : "昼"}｜${scene.isSafeZone ? "安全区偏可控" : "非安全区偏压迫"}`);
  lines.push(weaponLine(args.equippedWeapon));

  for (const v of views) {
    const npcId = v.profile.npcId;
    const npcRow = NPCS.find((x) => x.id === npcId) ?? null;
    const profileV2 = CORE_NPC_PROFILES_V2.find((p) => p.id === npcId) ?? null;
    const hidden = buildHiddenNpcCombatProfile({ npcId, codex: args.codex ?? null });
    const style = resolveNpcCombatStyle({
      npcId,
      npcProfileV2: profileV2,
      npcRegistryRow: npcRow,
      codexEntry: (args.codex ?? {})[npcId] ?? null,
      hiddenProfile: hidden,
    });
    const styleHint = styleTagsToPlayerHint(hidden.styleTags);

    lines.push(`- ${hidden.displayName}（${npcId}）风格=${style.def.label}${styleHint ? `｜偏：${styleHint}` : ""}`);
    lines.push(`  压迫源：${clampText(style.def.pressureSource.join("；"), 90)}`);
    lines.push(`  动作质感：${clampText(style.def.contactFeel.join("；"), 90)}`);
    lines.push(`  环境互动：${clampText(style.def.environmentInteraction.join("；"), 90)}`);
    lines.push(`  破坏尺度：${style.def.destructionScale}｜收束倾向：${style.def.finishTendency}`);
    lines.push(`  招牌拍子：${clampText(style.def.signatureBeats.slice(0, 2).join("；"), 96)}`);
    lines.push(`  禁写法：${clampText(style.def.forbiddenExaggerations.slice(0, 2).join("；"), 96)}`);
  }

  const text = lines.join("\n");
  return clampText(text, maxChars);
}

