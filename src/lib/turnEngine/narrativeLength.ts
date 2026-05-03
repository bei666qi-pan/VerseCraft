import type { NarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";

export type NarrativeLengthSeverity = "none" | "low" | "medium";

export type NarrativeLengthIssueCode =
  | "under_min"
  | "far_under_min"
  | "over_max"
  | "too_few_info_beats"
  | "micro_allowed"
  | "safety_fallback_exempt"
  | "illegal_action_exempt"
  | "death_or_hard_stop_exempt"
  | "system_transition_exempt";

export type AssessNarrativeLengthArgs = {
  narrative: string;
  budget: NarrativeBudget;
  plannedTurnMode?: string;
  isActionLegal?: boolean;
  isDeath?: boolean;
  isSafetyFallback?: boolean;
  isSystemTransition?: boolean;
  hasDecisionOptions?: boolean;
  riskTags?: string[];
};

export type NarrativeLengthAssessment = {
  ok: boolean;
  severity: NarrativeLengthSeverity;
  actualChars: number;
  minChars: number;
  targetChars: number;
  maxChars: number;
  estimatedInfoBeats: number;
  issueCodes: NarrativeLengthIssueCode[];
};

const FAR_UNDER_MIN_RATIO = 0.6;
const MICRO_SOFT_MIN_CHARS = 60;

const HARD_STOP_RISK_TAGS = new Set([
  "hard_stop",
  "danger_stop",
  "death_edge",
  "death_or_hard_stop",
  "forced_choice",
  "critical_choice",
]);

const BEAT_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  {
    code: "environment_feedback",
    pattern: /灯|光|影|风|雨|雾|墙|门|窗|地面|走廊|房间|空气|气味|声音|回声|脚步|震动|温度|潮湿|黑暗/,
  },
  {
    code: "npc_reaction",
    pattern: /他说|她说|对方|老人|欣蓝|NPC|住户|同学|看向|皱眉|沉默|后退|点头|摇头|压低声音|伸手/,
  },
  {
    code: "risk_change",
    pattern: /危险|风险|威胁|逼近|倒计时|追上|裂开|失控|警告|代价|理智|疼|血|死亡|退路|陷阱/,
  },
  {
    code: "clue_change",
    pattern: /线索|发现|档案|记录|钥匙|徽章|纸条|痕迹|真相|秘密|异常|编号|符号|证据|提示/,
  },
  {
    code: "relationship_change",
    pattern: /信任|怀疑|关系|债|承诺|答应|拒绝|隐瞒|坦白|熟悉|陌生|靠近|疏远|动摇/,
  },
  {
    code: "action_consequence",
    pattern: /我.*(推|拉|走|跑|看|听|问|拿|放|打开|关上|触碰|靠近|后退|躲|检查|翻开|递出|按下|进入|离开)/,
  },
];

export function assessNarrativeLength(args: AssessNarrativeLengthArgs): NarrativeLengthAssessment {
  const actualChars = countCompactChars(args.narrative);
  const minChars = Math.max(0, Math.round(args.budget.minChars));
  const targetChars = Math.max(minChars, Math.round(args.budget.targetChars));
  const maxChars = Math.max(targetChars, Math.round(args.budget.maxChars));
  const estimatedInfoBeats = estimateInfoBeats(args.narrative);
  const issueCodes: NarrativeLengthIssueCode[] = [];

  const exemption = resolveExemption(args, actualChars);
  if (exemption) {
    issueCodes.push(exemption);
    return {
      ok: true,
      severity: "none",
      actualChars,
      minChars,
      targetChars,
      maxChars,
      estimatedInfoBeats,
      issueCodes,
    };
  }

  if (actualChars < minChars) {
    issueCodes.push("under_min");
    if (actualChars < minChars * FAR_UNDER_MIN_RATIO) {
      issueCodes.push("far_under_min");
    }
  }

  if (actualChars > maxChars) {
    issueCodes.push("over_max");
  }

  if (estimatedInfoBeats < Math.max(1, args.budget.minInfoBeats)) {
    issueCodes.push("too_few_info_beats");
  }

  const severity = resolveSeverity(args.budget, issueCodes);

  return {
    ok: issueCodes.length === 0,
    severity,
    actualChars,
    minChars,
    targetChars,
    maxChars,
    estimatedInfoBeats,
    issueCodes,
  };
}

export function countCompactChars(text: string): number {
  return Array.from(String(text ?? "").replace(/\s+/g, "")).length;
}

export function estimateInfoBeats(narrative: string): number {
  const text = String(narrative ?? "").trim();
  if (!text) return 0;

  const matchedBeatCodes = new Set<string>();
  for (const beat of BEAT_PATTERNS) {
    if (beat.pattern.test(text)) {
      matchedBeatCodes.add(beat.code);
    }
  }

  const sentenceCount = splitSentences(text).filter((sentence) => countCompactChars(sentence) >= 6).length;
  const sentenceBeatEstimate = Math.min(3, sentenceCount);

  return Math.max(matchedBeatCodes.size, sentenceBeatEstimate);
}

function resolveExemption(
  args: AssessNarrativeLengthArgs,
  actualChars: number
): NarrativeLengthIssueCode | null {
  if (args.isSafetyFallback) return "safety_fallback_exempt";
  if (args.isActionLegal === false) return "illegal_action_exempt";
  if (args.isDeath || hasHardStopSignal(args.riskTags)) return "death_or_hard_stop_exempt";
  if (isSystemTransition(args)) return "system_transition_exempt";
  if (
    args.budget.tier === "micro" &&
    (actualChars >= MICRO_SOFT_MIN_CHARS || args.hasDecisionOptions)
  ) {
    return "micro_allowed";
  }
  return null;
}

function resolveSeverity(
  budget: NarrativeBudget,
  issueCodes: readonly NarrativeLengthIssueCode[]
): NarrativeLengthSeverity {
  if (issueCodes.length === 0) return "none";

  const hasFarUnder = issueCodes.includes("far_under_min");
  const hasUnder = issueCodes.includes("under_min");
  const hasTooFewBeats = issueCodes.includes("too_few_info_beats");

  if (budget.tier === "reveal" || budget.tier === "climax") {
    return hasUnder || hasTooFewBeats ? "medium" : "low";
  }

  if (budget.tier === "ending") {
    return hasFarUnder || (hasUnder && hasTooFewBeats) ? "medium" : "low";
  }

  if (budget.tier === "standard") {
    return hasFarUnder || (hasUnder && hasTooFewBeats) ? "medium" : "low";
  }

  return "low";
}

function hasHardStopSignal(riskTags: readonly string[] | undefined): boolean {
  return (riskTags ?? []).some((tag) => HARD_STOP_RISK_TAGS.has(tag.trim().toLowerCase()));
}

function isSystemTransition(args: AssessNarrativeLengthArgs): boolean {
  if (args.isSystemTransition) return true;
  const planned = String(args.plannedTurnMode ?? "").toLowerCase();
  return planned.includes("system_transition");
}

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
