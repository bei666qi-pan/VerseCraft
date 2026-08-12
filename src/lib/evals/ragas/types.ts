export const RAGAS_COMPAT_VERSION = "versecraft-ragas-compatible-v1" as const;

export type RagasCase = {
  id: string;
  datasetVersion?: string;
  retrievalTraceRef?: string;
  groundTruthProvenance?: string;
  question: string;
  answer: string;
  contexts: Array<{ id: string; text: string }>;
  referenceContextIds: string[];
  groundTruth: string;
};

export type RagasSummary = {
  version: typeof RAGAS_COMPAT_VERSION;
  total: number;
  passed: number;
  gatePass: boolean;
  averages: Record<RagasMetricResult["name"], number | null>;
};

export type RagasBaseline = {
  version: string;
  tolerance: number;
  averages: Partial<Record<RagasMetricResult["name"], number | null>>;
};

export type RagasMetricStatus = "ok" | "unavailable" | "failed";

export type RagasMetricResult = {
  name: "context_precision" | "context_recall" | "faithfulness" | "answer_relevancy";
  value: number | null;
  status: RagasMetricStatus;
  method: "deterministic" | "model_judge";
  reason?: string;
};

export type RagasCaseResult = {
  id: string;
  version: typeof RAGAS_COMPAT_VERSION;
  metrics: RagasMetricResult[];
  pass: boolean;
};
