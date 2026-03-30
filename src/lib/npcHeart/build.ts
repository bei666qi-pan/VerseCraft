import type { NpcProfileV2, NpcRelationStateV2, NpcSocialProfile } from "@/lib/registry/types";
import type { NpcHeartProfile, NpcTaskStyle, TruthfulnessBand, ManipulationMode } from "./types";
import { resolvePersonalityBundle } from "./personalityCore";

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(String(n ?? ""));
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function asText(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function deriveTaskStyleFromText(txt: string): NpcTaskStyle {
  const t = String(txt ?? "");
  if (/交易|交换|契约|价码|筹码|货/.test(t)) return "transactional";
  if (/试探|留后路|后手|把责任推给你|先示弱/.test(t)) return "manipulative";
  if (/回避|别问|不提|不明说|绕开/.test(t)) return "avoidant";
  if (/保护|守护|照应|提醒/.test(t)) return "protective";
  return "direct";
}

function deriveTruthfulnessBand(interactionTaboo: string, motives: string): TruthfulnessBand {
  const t = `${interactionTaboo} ${motives}`;
  if (/程序|执行|隐瞒|棋子|诱饵|绝不|不能说/.test(t)) return "low";
  if (/交易|留后路|试探|不直接/.test(t)) return "medium";
  return "high";
}

function deriveManipulationMode(taskStyle: NpcTaskStyle, motives: string): ManipulationMode {
  const t = String(motives ?? "");
  if (taskStyle === "manipulative") return "test_then_offer";
  if (/绩效|程序|执行|配额/.test(t)) return "reward_withheld";
  if (/愧疚|人情|欠/.test(t)) return "guilt";
  if (/恐惧|威胁|封锁|不得/.test(t)) return "fear";
  return "none";
}

export function buildNpcHeartProfile(args: {
  npcId: string;
  profileV2: NpcProfileV2 | null;
  social: NpcSocialProfile | null;
}): NpcHeartProfile | null {
  const p = args.profileV2;
  const s = args.social;
  if (!p && !s) return null;

  const bundle = resolvePersonalityBundle({
    npcId: args.npcId,
    profileV2: p,
    social: s,
  });
  const { core, scenarios, charmTier } = bundle;

  const displayName = p?.display?.name ?? "";
  const surfaceMask = [
    asText(p?.display?.publicPersonality),
    asText(p?.display?.specialty),
  ].filter(Boolean).join(" / ");
  const coreDrive = asText(s?.core_desires) || asText(p?.deepSecret?.trueMotives?.join("；"));
  const coreFear = asText(s?.core_fear) || asText(s?.weakness) || asText(p?.interaction?.taboo);
  const tabooBoundary = asText(p?.interaction?.taboo) || asText(s?.weakness);
  const dependencyNeed = asText(s?.emotional_debt_pattern) || core.attachmentPattern;
  const softSpot = asText(s?.emotional_traits) || asText(p?.interaction?.surfaceSecrets?.[0]) || core.contradictionSignature;
  const taskStyle =
    (asText(s?.task_style) as NpcTaskStyle) ||
    deriveTaskStyleFromText(`${s?.relationships ? JSON.stringify(s.relationships) : ""} ${p?.interaction?.speechPattern ?? ""} ${core.speechCadence}`);
  const truthfulnessBand =
    (asText(s?.truthfulness_band) as TruthfulnessBand) || deriveTruthfulnessBand(asText(p?.interaction?.taboo), coreDrive);
  const manipulationMode = deriveManipulationMode(taskStyle, `${coreDrive} ${s?.fixed_lore ?? ""}`);
  const rupture = s?.rupture_threshold;
  const ruptureThreshold = {
    trustBelow: clampInt(rupture?.trustBelow, 20, 80),
    fearAbove: clampInt(rupture?.fearAbove, 10, 90),
    debtAbove: clampInt(rupture?.debtAbove, 5, 99),
  };

  /** 话术契约：人格锚优先，原文案补充（非用正则替代显式核） */
  const speechContract = [
    core.speechCadence,
    core.recurringGesture,
    asText(s?.speech_patterns),
    asText(p?.interaction?.speechPattern),
  ]
    .filter(Boolean)
    .join("；")
    .slice(0, 200) || `${core.speechCadence}；${core.recurringGesture}`;

  const emotionalDebtPattern = asText(s?.emotional_debt_pattern) || `${core.attachmentPattern}；${core.controlNeed}`;

  const betrayalStyle = /诱饵|程序|执行/.test(`${coreDrive} ${s?.fixed_lore ?? ""}`)
    ? "表面温和，翻脸时像执行程序一样冷。"
    : taskStyle === "manipulative"
      ? "先示弱再反咬，把责任推给你。"
      : "不轻易翻脸，但一旦破裂就不再回头。";

  const rescueStyle =
    taskStyle === "protective"
      ? `${core.rescueInstinctStyle}；给出可执行提醒。`
      : `${core.rescueInstinctStyle}；可能要求交换。`;

  const whatNpcWillNeverAskOpenly =
    asText(p?.deepSecret?.conspiracyRole)
      ? `与${asText(p?.deepSecret?.conspiracyRole)}相关的事不会明说。`
      : `真相用${core.truthEvasionStyle}处理，不摊牌根因。`;

  return {
    npcId: args.npcId,
    displayName: displayName || args.npcId,
    surfaceMask: surfaceMask || "表面平静",
    coreDrive: coreDrive || "维持自身存续与秩序",
    coreFear: coreFear || core.shameTrigger || "失控与暴露",
    dependencyNeed,
    softSpot,
    tabooBoundary: tabooBoundary || "触碰禁区会立刻翻脸",
    ruptureThreshold,
    taskStyle,
    speechContract,
    manipulationMode,
    truthfulnessBand,
    emotionalDebtPattern,
    betrayalStyle,
    rescueStyle,
    whatNpcWillNeverAskOpenly,
    personalityCore: core,
    personalityScenarios: scenarios,
    charmTier,
  };
}

export function normalizeRelationStatePartial(input: Partial<NpcRelationStateV2> | null | undefined): NpcRelationStateV2 {
  const o = input ?? {};
  return {
    favorability: clampInt(o.favorability, -100, 100),
    trust: clampInt(o.trust, -100, 100),
    fear: clampInt(o.fear, -100, 100),
    debt: clampInt(o.debt, 0, 999),
    affection: clampInt(o.affection, -100, 100),
    desire: clampInt(o.desire, -100, 100),
    romanceEligible: Boolean(o.romanceEligible),
    romanceStage: o.romanceStage ?? "none",
    betrayalFlags: Array.isArray(o.betrayalFlags) ? o.betrayalFlags.filter((x): x is string => typeof x === "string").slice(0, 24) : [],
  };
}
