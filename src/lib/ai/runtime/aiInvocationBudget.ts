export type AiInvocationBudgetSpec = {
  maxCalls: number;
  maxOutputTokens: number;
  deadlineMs: number;
  maxEstimatedCostCnyMicros?: number;
};

export type AiInvocationClaim = {
  outputTokens: number;
  estimatedCostCnyMicros?: number;
};

export type AiInvocationBudgetRejection =
  | "max_calls"
  | "max_output_tokens"
  | "max_cost"
  | "deadline";

export interface AiInvocationBudget {
  claim(input: AiInvocationClaim):
    | { ok: true; callIndex: number }
    | { ok: false; reason: AiInvocationBudgetRejection };
  snapshot(): {
    claimedCalls: number;
    claimedOutputTokens: number;
    claimedEstimatedCostCnyMicros: number;
    elapsedMs: number;
  };
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function createAiInvocationBudget(
  input: AiInvocationBudgetSpec,
  now: () => number = Date.now,
): AiInvocationBudget {
  const spec = {
    maxCalls: nonNegativeInteger(input.maxCalls),
    maxOutputTokens: nonNegativeInteger(input.maxOutputTokens),
    deadlineMs: nonNegativeInteger(input.deadlineMs),
    maxEstimatedCostCnyMicros:
      input.maxEstimatedCostCnyMicros === undefined
        ? undefined
        : nonNegativeInteger(input.maxEstimatedCostCnyMicros),
  };
  const startedAt = now();
  let claimedCalls = 0;
  let claimedOutputTokens = 0;
  let claimedEstimatedCostCnyMicros = 0;

  return {
    claim(claim) {
      const outputTokens = nonNegativeInteger(claim.outputTokens);
      const estimatedCost = nonNegativeInteger(claim.estimatedCostCnyMicros ?? 0);
      if (now() - startedAt > spec.deadlineMs) return { ok: false, reason: "deadline" };
      if (claimedCalls + 1 > spec.maxCalls) return { ok: false, reason: "max_calls" };
      if (claimedOutputTokens + outputTokens > spec.maxOutputTokens) {
        return { ok: false, reason: "max_output_tokens" };
      }
      if (
        spec.maxEstimatedCostCnyMicros !== undefined &&
        claimedEstimatedCostCnyMicros + estimatedCost > spec.maxEstimatedCostCnyMicros
      ) {
        return { ok: false, reason: "max_cost" };
      }
      claimedCalls += 1;
      claimedOutputTokens += outputTokens;
      claimedEstimatedCostCnyMicros += estimatedCost;
      return { ok: true, callIndex: claimedCalls };
    },
    snapshot() {
      return {
        claimedCalls,
        claimedOutputTokens,
        claimedEstimatedCostCnyMicros,
        elapsedMs: Math.max(0, now() - startedAt),
      };
    },
  };
}
