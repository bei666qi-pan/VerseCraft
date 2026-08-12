import { RAGAS_COMPAT_VERSION, type RagasBaseline, type RagasCase, type RagasCaseResult, type RagasMetricResult, type RagasSummary } from "./types";

export type RagasThresholds = {
  contextPrecision: number;
  contextRecall: number;
  faithfulness: number;
  answerRelevancy: number;
};

export const DEFAULT_RAGAS_THRESHOLDS: RagasThresholds = {
  contextPrecision: 0.7,
  contextRecall: 0.8,
  faithfulness: 0.8,
  answerRelevancy: 0.75,
};

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(6));
}

export function contextPrecision(testCase: RagasCase): number {
  const relevant = new Set(testCase.referenceContextIds);
  return ratio(testCase.contexts.filter((context) => relevant.has(context.id)).length, testCase.contexts.length);
}

export function contextRecall(testCase: RagasCase): number {
  const retrieved = new Set(testCase.contexts.map((context) => context.id));
  const relevant = new Set(testCase.referenceContextIds);
  return ratio([...relevant].filter((id) => retrieved.has(id)).length, relevant.size);
}

export function evaluateDeterministicRagasCase(
  testCase: RagasCase,
  judgedMetrics: RagasMetricResult[] = [],
  thresholds = DEFAULT_RAGAS_THRESHOLDS
): RagasCaseResult {
  const metrics: RagasMetricResult[] = [
    { name: "context_precision", value: contextPrecision(testCase), status: "ok", method: "deterministic" },
    { name: "context_recall", value: contextRecall(testCase), status: "ok", method: "deterministic" },
    ...judgedMetrics,
  ];
  for (const name of ["faithfulness", "answer_relevancy"] as const) {
    if (!metrics.some((metric) => metric.name === name)) {
      metrics.push({ name, value: null, status: "unavailable", method: "model_judge", reason: "live_judge_not_requested" });
    }
  }
  const floors: Record<RagasMetricResult["name"], number> = {
    context_precision: thresholds.contextPrecision,
    context_recall: thresholds.contextRecall,
    faithfulness: thresholds.faithfulness,
    answer_relevancy: thresholds.answerRelevancy,
  };
  const pass = metrics.every((metric) => metric.status === "ok" && metric.value !== null && metric.value >= floors[metric.name]);
  return { id: testCase.id, version: RAGAS_COMPAT_VERSION, metrics, pass };
}

export function summarizeRagasResults(results: RagasCaseResult[]): RagasSummary {
  const metricNames: RagasMetricResult["name"][] = ["context_precision", "context_recall", "faithfulness", "answer_relevancy"];
  const averages = Object.fromEntries(metricNames.map((name) => {
    const values = results.flatMap((result) => result.metrics.filter((metric) => metric.name === name && metric.status === "ok" && metric.value !== null).map((metric) => metric.value as number));
    return [name, values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)) : null];
  })) as RagasSummary["averages"];
  return {
    version: RAGAS_COMPAT_VERSION,
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    gatePass: results.length > 0 && results.every((result) => result.pass),
    averages,
  };
}

export function compareRagasBaseline(summary: RagasSummary, baseline: RagasBaseline) {
  const deltas = Object.fromEntries(
    Object.entries(baseline.averages).map(([name, baselineValue]) => {
      const current = summary.averages[name as RagasMetricResult["name"]];
      return [name, current === null || baselineValue == null ? null : Number((current - baselineValue).toFixed(6))];
    })
  ) as Partial<Record<RagasMetricResult["name"], number | null>>;
  const regressions = Object.entries(deltas)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] < -Math.abs(baseline.tolerance))
    .map(([name]) => name);
  return { version: baseline.version, tolerance: baseline.tolerance, deltas, regressions, pass: regressions.length === 0 };
}
