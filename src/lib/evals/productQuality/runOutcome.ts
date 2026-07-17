export type RunEvidenceStatus = "pass" | "fail" | "inconclusive";
export type EvalExecutionMode = "mock_full" | "live_full" | "live_degraded";

export function resolveEvalExecutionMode(args: {
  live: boolean;
  degradedSteps: number;
  terminatedReason: string;
}): EvalExecutionMode {
  if (!args.live) return "mock_full";
  return args.degradedSteps > 0 || args.terminatedReason === "error" ? "live_degraded" : "live_full";
}

export type ClassifyRunEvidenceArgs = {
  executionMode: string;
  terminatedReason: string;
  judgePassed: boolean;
  gameplayGatePassed: boolean;
  executedSteps: number;
  plannedScenarioSteps: number;
};

/** Separates product failure from a deliberately budget-truncated probe. */
export function classifyRunEvidence(args: ClassifyRunEvidenceArgs): RunEvidenceStatus {
  if (args.executionMode === "live_degraded" || args.terminatedReason === "error" || args.terminatedReason === "softlock") return "fail";
  if (!args.judgePassed) return "fail";
  if (args.gameplayGatePassed) return "pass";
  if (args.terminatedReason === "max_steps" && args.executedSteps < args.plannedScenarioSteps) return "inconclusive";
  return "fail";
}
