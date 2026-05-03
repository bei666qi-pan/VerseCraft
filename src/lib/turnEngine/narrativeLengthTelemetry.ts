import type { NarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";
import {
  assessNarrativeLength,
  countCompactChars,
  type AssessNarrativeLengthArgs,
  NarrativeLengthAssessment,
  NarrativeLengthIssueCode,
  NarrativeLengthSeverity,
} from "@/lib/turnEngine/narrativeLength";

export type NarrativeLengthTelemetryStatus = "ok" | "budget_missing" | "assessment_error";
export type NarrativeLengthTelemetrySeverity = NarrativeLengthSeverity | "error";
export type NarrativeLengthTelemetryIssueCode =
  | NarrativeLengthIssueCode
  | "budget_missing"
  | "assessment_error";

export type NarrativeLengthTelemetry = {
  narrativeBudgetTier: string | null;
  narrativeBudgetReasonCodes: string[];
  narrativeMinChars: number | null;
  narrativeTargetChars: number | null;
  narrativeMaxChars: number | null;
  actualNarrativeChars: number | null;
  estimatedInfoBeats: number | null;
  narrativeLengthSeverity: NarrativeLengthTelemetrySeverity;
  narrativeLengthIssueCodes: NarrativeLengthTelemetryIssueCode[];
  narrativeUnderMin: boolean;
  narrativeOverMax: boolean;
  playerChatMaxTokens: number | null;
  narrativeLengthStatus: NarrativeLengthTelemetryStatus;
};

export function buildNarrativeLengthTelemetry(args: {
  budget?: NarrativeBudget | null;
  assessment?: NarrativeLengthAssessment | null;
  playerChatMaxTokens?: number | null;
  status?: NarrativeLengthTelemetryStatus;
  actualNarrativeChars?: number | null;
}): NarrativeLengthTelemetry {
  const budget = args.budget ?? null;
  const assessment = args.assessment ?? null;
  const playerChatMaxTokens = optionalFiniteNonNegativeInt(args.playerChatMaxTokens);
  const actualNarrativeChars =
    optionalFiniteNonNegativeInt(args.actualNarrativeChars) ??
    optionalFiniteNonNegativeInt(assessment?.actualChars);

  if (!budget) {
    return {
      narrativeBudgetTier: null,
      narrativeBudgetReasonCodes: [],
      narrativeMinChars: null,
      narrativeTargetChars: null,
      narrativeMaxChars: null,
      actualNarrativeChars,
      estimatedInfoBeats: optionalFiniteNonNegativeInt(assessment?.estimatedInfoBeats),
      narrativeLengthSeverity: "none",
      narrativeLengthIssueCodes: ["budget_missing"],
      narrativeUnderMin: false,
      narrativeOverMax: false,
      playerChatMaxTokens,
      narrativeLengthStatus: "budget_missing",
    };
  }

  const base = {
    narrativeBudgetTier: budget.tier,
    narrativeBudgetReasonCodes: [...budget.reasonCodes],
    narrativeMinChars: optionalFiniteNonNegativeInt(budget.minChars),
    narrativeTargetChars: optionalFiniteNonNegativeInt(budget.targetChars),
    narrativeMaxChars: optionalFiniteNonNegativeInt(budget.maxChars),
    actualNarrativeChars,
    playerChatMaxTokens,
  };

  if (args.status === "assessment_error") {
    return {
      ...base,
      estimatedInfoBeats: null,
      narrativeLengthSeverity: "error",
      narrativeLengthIssueCodes: ["assessment_error"],
      narrativeUnderMin: false,
      narrativeOverMax: false,
      narrativeLengthStatus: "assessment_error",
    };
  }

  if (!assessment) {
    return {
      ...base,
      estimatedInfoBeats: null,
      narrativeLengthSeverity: "none",
      narrativeLengthIssueCodes: [],
      narrativeUnderMin: false,
      narrativeOverMax: false,
      narrativeLengthStatus: args.status ?? "ok",
    };
  }

  const issueCodes = [...assessment.issueCodes];
  return {
    ...base,
    estimatedInfoBeats: optionalFiniteNonNegativeInt(assessment.estimatedInfoBeats),
    narrativeLengthSeverity: assessment.severity,
    narrativeLengthIssueCodes: issueCodes,
    narrativeUnderMin: issueCodes.includes("under_min") || issueCodes.includes("far_under_min"),
    narrativeOverMax: issueCodes.includes("over_max"),
    narrativeLengthStatus: "ok",
  };
}

export function assessNarrativeLengthForTelemetry(args: {
  narrative: string;
  budget?: NarrativeBudget | null;
  playerChatMaxTokens?: number | null;
  plannedTurnMode?: string;
  isActionLegal?: boolean;
  isDeath?: boolean;
  isSafetyFallback?: boolean;
  isSystemTransition?: boolean;
  hasDecisionOptions?: boolean;
  riskTags?: string[];
  assess?: (args: AssessNarrativeLengthArgs) => NarrativeLengthAssessment;
}): { telemetry: NarrativeLengthTelemetry; assessmentError: unknown | null } {
  const actualNarrativeChars = countCompactChars(args.narrative);
  const budget = args.budget ?? null;

  if (!budget) {
    return {
      telemetry: buildNarrativeLengthTelemetry({
        budget: null,
        playerChatMaxTokens: args.playerChatMaxTokens,
        actualNarrativeChars,
        status: "budget_missing",
      }),
      assessmentError: null,
    };
  }

  try {
    const assess = args.assess ?? assessNarrativeLength;
    const assessment = assess({
      narrative: args.narrative,
      budget,
      plannedTurnMode: args.plannedTurnMode,
      isActionLegal: args.isActionLegal,
      isDeath: args.isDeath,
      isSafetyFallback: args.isSafetyFallback,
      isSystemTransition: args.isSystemTransition,
      hasDecisionOptions: args.hasDecisionOptions,
      riskTags: args.riskTags,
    });
    return {
      telemetry: buildNarrativeLengthTelemetry({
        budget,
        assessment,
        playerChatMaxTokens: args.playerChatMaxTokens,
      }),
      assessmentError: null,
    };
  } catch (error) {
    return {
      telemetry: buildNarrativeLengthTelemetry({
        budget,
        playerChatMaxTokens: args.playerChatMaxTokens,
        actualNarrativeChars,
        status: "assessment_error",
      }),
      assessmentError: error,
    };
  }
}

function optionalFiniteNonNegativeInt(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
}
