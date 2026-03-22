import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { TokenUsage } from "@/lib/ai/types/core";

/**
 * Rough relative pricing for observability (USD). Heuristic only; swap models via one-api without code changes.
 * Values are per 1M tokens (input / output).
 */
const USD_PER_M: Record<AiLogicalRole, { input: number; output: number }> = {
  main: { input: 0.14, output: 0.28 },
  control: { input: 0.02, output: 0.02 },
  enhance: { input: 0.12, output: 0.12 },
  reasoner: { input: 0.28, output: 0.56 },
};

function totalFromUsage(u: TokenUsage | null | undefined): { inT: number; outT: number } {
  if (!u) return { inT: 0, outT: 0 };
  const pt = Number(u.promptTokens ?? u.totalTokens ?? 0);
  const ct = Number(u.completionTokens ?? 0);
  const tt = Number(u.totalTokens ?? 0);
  if (tt > 0 && pt === 0 && ct === 0) {
    return { inT: tt * 0.55, outT: tt * 0.45 };
  }
  if (pt > 0 || ct > 0) {
    return { inT: pt || 0, outT: ct || Math.max(0, tt - pt) };
  }
  return { inT: 0, outT: 0 };
}

export function estimateUsdForUsage(
  logicalRole: AiLogicalRole,
  usage: TokenUsage | null | undefined
): number {
  const rates = USD_PER_M[logicalRole] ?? USD_PER_M.main;
  const { inT, outT } = totalFromUsage(usage);
  return (inT / 1_000_000) * rates.input + (outT / 1_000_000) * rates.output;
}
