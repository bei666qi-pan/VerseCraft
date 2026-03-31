import type { CodexEntry } from "@/store/useGameStore";
import type { NpcProfileV2 } from "@/lib/registry/types";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { getRegisteredStyleKeyForMajorNpc, resolveNpcStyleTemplateKey } from "./npcCombatStyles";
import type {
  CombatStyleTag,
  CombatDangerTierForPlayer,
  CombatTacticTag,
  CombatWeakTag,
  HiddenNpcCombatProfileV1,
  NpcCombatStoryClass,
} from "./types";

/** 兼容旧名：外部仍可继续 import { HiddenNpcCombatProfile } */
export type HiddenNpcCombatProfile = HiddenNpcCombatProfileV1;

function clipName(s: string): string {
  const t = String(s ?? "").trim();
  return t || "某位住户";
}

function floorHintToStyle(floor: string): CombatStyleTag[] {
  if (floor === "B1") return ["utility_support", "close_quarters"];
  if (floor === "7") return ["ambush", "social_pressure"];
  return ["close_quarters"];
}

function storyClassOf(npcId: string, profile: NpcProfileV2 | null): NpcCombatStoryClass {
  if (npcId === "N-015" || npcId === "N-010" || npcId === "N-018" || npcId === "N-013" || npcId === "N-007" || npcId === "N-020") {
    return "major_charm";
  }
  const floor = String(profile?.display?.floor ?? "");
  if (floor === "B1") return "resident";
  return "resident";
}

function styleKeyOf(npcId: string, styleTags: CombatStyleTag[], storyClass: NpcCombatStoryClass): string {
  // 稳定 key：优先使用注册表可识别的 major key；否则走模板族谱兜底（可长期维护）
  if (storyClass === "major_charm") return getRegisteredStyleKeyForMajorNpc(npcId) ?? `major:${npcId}`;
  return resolveNpcStyleTemplateKey({
    npcId,
    npcProfileV2: CORE_NPC_PROFILES_V2.find((p) => p.id === npcId) ?? null,
    hiddenProfile: { storyClass, styleTags } as any,
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function defaultAxes(args: { npcId: string; basePower: number; styleTags: CombatStyleTag[]; storyClass: NpcCombatStoryClass }): Pick<
  HiddenNpcCombatProfileV1,
  "volatility" | "aggression" | "discipline" | "resilience" | "fearThreshold"
> {
  const p = Math.max(0, Math.min(60, Math.trunc(args.basePower)));
  // “稳定优先”策略：高魅力更讲究风格与克制，波动性反而更低（避免纯随机）
  const majorBias = args.storyClass === "major_charm" ? 0.08 : 0;
  const hasAmbush = args.styleTags.includes("ambush");
  const hasTrade = args.styleTags.includes("tradecraft");
  const hasBoundary = args.styleTags.includes("boundary_guard");
  const hasMedical = args.styleTags.includes("medical_control");
  const hasMirror = args.styleTags.includes("mirror_counter");

  const volatility = clamp01(0.22 + (hasAmbush ? 0.12 : 0) + (hasMirror ? 0.06 : 0) - majorBias);
  const aggression = clamp01(0.35 + (hasAmbush ? 0.18 : 0) + (hasBoundary ? 0.12 : 0) - (hasTrade ? 0.08 : 0));
  const discipline = clamp01(0.42 + (hasBoundary ? 0.2 : 0) + (hasTrade ? 0.16 : 0) + (hasMedical ? 0.16 : 0) + (p >= 12 ? 0.06 : 0));
  const resilience = clamp01(0.38 + (p >= 9 ? 0.1 : 0) + (p >= 14 ? 0.08 : 0) + (hasBoundary ? 0.06 : 0));
  const fearThreshold = clamp01(0.36 + (p >= 10 ? 0.1 : 0) + (hasTrade ? 0.05 : 0));
  return { volatility, aggression, discipline, resilience, fearThreshold };
}

function tacticTagsFromStyle(styleTags: CombatStyleTag[], signature: HiddenNpcCombatProfileV1["signature"]): CombatTacticTag[] {
  const base: CombatTacticTag[] = [...styleTags];
  // 用 signature 文本做极轻量补充（不引入随机性）
  const s = `${signature.short} ${signature.do.join(" ")}`;
  if (/切断退路|卡住退路|守线|边界/.test(s)) base.unshift("rule_lock");
  if (/压住手腕|擒拿|制服|卡住/.test(s)) base.unshift("grapple");
  if (/试探|换价|条件|账/.test(s)) base.unshift("feint");
  if (/护送|止损|保护/.test(s)) base.unshift("escort");
  return [...new Set(base)].slice(0, 6);
}

function weakTagsHeuristic(args: { volatility: number; discipline: number; resilience: number; storyClass: NpcCombatStoryClass; styleTags: CombatStyleTag[] }): CombatWeakTag[] {
  const out: CombatWeakTag[] = [];
  if (args.discipline < 0.35) out.push("low_discipline");
  if (args.resilience < 0.32) out.push("low_resilience");
  if (args.volatility >= 0.38) out.push("overconfident");
  if (args.styleTags.includes("tradecraft")) out.push("debt_bound");
  return out.length > 0 ? out : ["unknown"];
}

/**
 * 高魅力 NPC：必须稳定“独特战斗风格”，并且服务于人设（而非同质化）。
 * 这里做最小一版：用固定映射 + profile 文本推断做补充。
 */
function majorNpcStyleTags(npcId: string, profile: NpcProfileV2 | null): CombatStyleTag[] {
  switch (npcId) {
    case "N-015":
      return ["boundary_guard", "close_quarters"];
    case "N-020":
      return ["utility_support", "social_pressure"];
    case "N-010":
      return ["tradecraft", "social_pressure"];
    case "N-018":
      return ["tradecraft", "ambush"];
    case "N-013":
      return ["ambush", "social_pressure"];
    case "N-007":
      return ["mirror_counter", "ambush"];
    default: {
      const base = floorHintToStyle(String(profile?.display?.floor ?? ""));
      const sp = String(profile?.interaction?.speechPattern ?? "");
      if (/规矩|边界|越界|守/.test(sp)) base.unshift("boundary_guard");
      if (/交易|对价|账|契约|条件/.test(sp)) base.unshift("tradecraft");
      if (/医生|检查|诊|病历|麻/.test(sp)) base.unshift("medical_control");
      return [...new Set(base)];
    }
  }
}

function dangerTierFromBasePower(p: number | null): CombatDangerTierForPlayer {
  if (p === null) return "unknown";
  if (p <= 2) return "negligible";
  if (p <= 4) return "low";
  if (p <= 7) return "medium";
  if (p <= 10) return "high";
  return "extreme";
}

function signatureForMajor(npcId: string): HiddenNpcCombatProfile["signature"] | null {
  switch (npcId) {
    case "N-015":
      return {
        short: "守线不让步，卡住退路与越界窗口。",
        do: ["压迫逼退", "切断退路", "用规则/边界逼你收手"],
        dont: ["不要写成大范围爆炸", "不要出现夸张楼体破坏"],
      };
    case "N-020":
      return {
        short: "更像在“保护与止损”，用短促动作与心理压迫让你停下。",
        do: ["压住手腕/动作", "用情绪与节奏逼你退半步", "把冲突降到可控"],
        dont: ["不要写成华丽异能特效", "不要上升到血条大战"],
      };
    case "N-010":
      return {
        short: "先谈条件再动手：她的优势在于提前看见你的犹豫。",
        do: ["逼你做选择", "抓住破绽让你“自己退”", "以退为进换位置"],
        dont: ["不要写成玄幻大招", "不要让她像莽撞打手"],
      };
    case "N-018":
      return {
        short: "像商人一样打架：试探、换价、撤离窗口，一切都算在账上。",
        do: ["短促爆发后立刻拉开", "用物件/地形换优势", "撤离而不是死磕"],
        dont: ["不要写成屠城级破坏", "不要让他失去“交易”气质"],
      };
    case "N-013":
      return {
        short: "诱导你先动，再把你推到不舒服的位置。",
        do: ["假弱示破绽", "引导你靠近危险点", "用话术让你迟疑"],
        dont: ["不要写成纯近战猛男", "不要出现夸张杀招"],
      };
    case "N-007":
      return {
        short: "像镜子：不硬拼，专挑你用力的那一瞬反制。",
        do: ["错位反制", "借力打力", "把你的动作变成你的负担"],
        dont: ["不要写成光炮/爆炸", "不要让她像热血战士"],
      };
    default:
      return null;
  }
}

export function getHiddenNpcCombatProfile(args: {
  npcId: string;
  codexEntry?: CodexEntry | null;
  profileOverride?: NpcProfileV2 | null;
}): HiddenNpcCombatProfile {
  const npcId = String(args.npcId ?? "").trim() || "unknown_npc";
  const profile =
    args.profileOverride ??
    CORE_NPC_PROFILES_V2.find((p) => p.id === npcId) ??
    null;
  const canon = getNpcCanonicalIdentity(npcId);

  // basePower：优先 codex（可被 DM 更新），否则用 profile.display.combatPower，否则用 canon 的 display 线索兜底
  const codexPower = typeof args.codexEntry?.combatPower === "number" ? args.codexEntry!.combatPower : null;
  const profilePower = typeof profile?.display?.combatPower === "number" ? profile!.display.combatPower : null;
  const basePower = (codexPower ?? profilePower ?? (Number.isFinite((canon as any)?.combatPower) ? Number((canon as any).combatPower) : 4)) as number;

  const styleTags = majorNpcStyleTags(npcId, profile);
  const signature = signatureForMajor(npcId) ?? {
    short: "短促、克制、以退为进。",
    do: ["压迫对方退让", "卡住退路", "快速脱离"],
    dont: ["不要写成夸张特效", "不要出现大面积破坏"],
  };

  const storyClass = storyClassOf(npcId, profile);
  const styleKey = styleKeyOf(npcId, styleTags, storyClass);
  const axes = defaultAxes({ npcId, basePower, styleTags, storyClass });
  const tacticTags = tacticTagsFromStyle(styleTags, signature);
  const weakTags = weakTagsHeuristic({ ...axes, storyClass, styleTags });

  const displayName =
    clipName(args.codexEntry?.name) ||
    clipName(profile?.display?.name) ||
    clipName(canon?.name);

  const dangerForPlayer = dangerTierFromBasePower(Number.isFinite(basePower) ? basePower : null);
  return {
    npcId,
    displayName,
    basePower: Math.max(0, Math.min(60, Math.trunc(basePower))),
    volatility: axes.volatility,
    aggression: axes.aggression,
    discipline: axes.discipline,
    resilience: axes.resilience,
    fearThreshold: axes.fearThreshold,
    tacticTags,
    weakTags,
    storyClass,
    styleKey,
    styleTags,
    signature,
    dangerForPlayer,
  };
}

