export type RunEvidenceStatus = "pass" | "fail" | "inconclusive" | "infrastructure_failure";
export type EvalExecutionMode = "mock_full" | "live_full" | "live_degraded";
export type EvalJudgeMode = "live" | "mock" | "codex" | "fallback" | "none";

export const REQUIRED_DM_FIELDS = ["is_action_legal", "sanity_damage", "narrative", "is_death"] as const;

export function resolveEvalExecutionMode(args: {
  live: boolean;
  degradedSteps: number;
  terminatedReason: string;
}): EvalExecutionMode {
  if (!args.live) return "mock_full";
  return args.degradedSteps > 0 || args.terminatedReason === "error" ? "live_degraded" : "live_full";
}

export function hasRequiredDmFields(dmJson: Record<string, unknown>): boolean {
  return REQUIRED_DM_FIELDS.every((field) => Object.hasOwn(dmJson, field));
}

export type JudgeEligibilityArgs = {
  executionMode: string;
  terminatedReason: string;
  executedSteps: number;
  degradedSteps: number;
  protocolComplete: boolean;
  requiredDmFieldsComplete: boolean;
  fixedTemplateDetected?: boolean;
};

export type JudgeEligibility = {
  eligible: boolean;
  status: "inconclusive" | "infrastructure_failure" | null;
  reason: string | null;
};

/** Decides whether a transcript is complete enough to send to any judge. */
export function assessJudgeEligibility(args: JudgeEligibilityArgs): JudgeEligibility {
  if (args.executionMode === "live_degraded" || args.degradedSteps > 0 || args.terminatedReason === "error") {
    return {
      eligible: false,
      status: "infrastructure_failure",
      reason: "SUT 运行错误、超时或返回了基础设施降级响应",
    };
  }
  if (args.executedSteps <= 0) {
    return { eligible: false, status: "inconclusive", reason: "没有完成任何可评分回合" };
  }
  if (!args.protocolComplete) {
    return {
      eligible: false,
      status: args.executionMode.startsWith("live") ? "infrastructure_failure" : "inconclusive",
      reason: "SSE 未到达完整权威终帧",
    };
  }
  if (!args.requiredDmFieldsComplete) {
    return { eligible: false, status: "inconclusive", reason: "权威终帧缺少必需 DM 字段" };
  }
  if (args.fixedTemplateDetected) {
    return { eligible: false, status: "inconclusive", reason: "转录仅包含重复固定模板，不能作为叙事质量证据" };
  }
  return { eligible: true, status: null, reason: null };
}

export function isFixedTemplateTranscript(narratives: string[]): boolean {
  const normalized = narratives.map((value) => value.trim().replace(/\s+/g, " ")).filter(Boolean);
  return normalized.length >= 2 && new Set(normalized).size === 1;
}

export type ClassifyRunEvidenceArgs = {
  executionMode: string;
  terminatedReason: string;
  judgePassed: boolean | null;
  judgeMode: EvalJudgeMode;
  gameplayGatePassed: boolean;
  executedSteps: number;
  plannedScenarioSteps: number;
  eligibility: JudgeEligibility;
};

/** Separates product quality failures from incomplete or infrastructure evidence. */
export function classifyRunEvidence(args: ClassifyRunEvidenceArgs): RunEvidenceStatus {
  if (!args.eligibility.eligible) return args.eligibility.status ?? "inconclusive";
  if (args.executionMode === "live_full" && args.judgeMode !== "live") return "inconclusive";
  if (args.judgePassed === null) return "inconclusive";
  if (!args.judgePassed) return "fail";
  if (args.gameplayGatePassed) return "pass";
  if (args.terminatedReason === "max_steps" && args.executedSteps < args.plannedScenarioSteps) return "inconclusive";
  return "fail";
}

export function isQualifiedLiveEvidence(args: {
  executionMode: string;
  judgeMode: EvalJudgeMode;
  judgeResult: unknown;
  evidenceStatus: RunEvidenceStatus;
}): boolean {
  return args.executionMode === "live_full"
    && args.judgeMode === "live"
    && hasAuthenticLiveJudgeProvenance(args.judgeResult)
    && (args.evidenceStatus === "pass" || args.evidenceStatus === "fail");
}

/** Defense in depth: the result itself must prove live provenance. */
export function hasAuthenticLiveJudgeProvenance(judgeResult: unknown): boolean {
  return judgeResult !== null
    && typeof judgeResult === "object"
    && !Array.isArray(judgeResult)
    && (judgeResult as { judgeMode?: unknown }).judgeMode === "live";
}
