import type { AiInsightOutput } from "@/lib/admin/aiInsights";

const PRIORITY = new Set(["immediate", "this_week", "mid_term"]);
const CONF_LEVEL = new Set(["high", "medium", "low"]);

export function validateAiInsightOutput(input: unknown): AiInsightOutput | null {
  if (!input || typeof input !== "object") return null;
  const x = input as Record<string, unknown>;
  if (typeof x.executiveSummary !== "string") return null;
  if (!Array.isArray(x.top3Actions)) return null;
  if (!Array.isArray(x.evidence)) return null;
  const confidence = x.confidence as Record<string, unknown> | undefined;
  if (!confidence || typeof confidence.score !== "number" || !CONF_LEVEL.has(String(confidence.level ?? ""))) return null;

  const checkPriorityArray = (arr: unknown): boolean => Array.isArray(arr) && arr.every((i) => PRIORITY.has(String((i as Record<string, unknown>).priority ?? "")));
  if (!checkPriorityArray(x.retentionRisks)) return null;
  if (!checkPriorityArray(x.productProblems)) return null;
  if (!checkPriorityArray(x.opportunityPoints)) return null;
  if (!checkPriorityArray(x.top3Actions)) return null;

  const evidenceSufficiency = String(x.evidenceSufficiency ?? "");
  if (evidenceSufficiency !== "enough" && evidenceSufficiency !== "insufficient") return null;
  return x as AiInsightOutput;
}

