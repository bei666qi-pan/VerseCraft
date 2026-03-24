export type AnalysisTask = "admin_insight" | "settlement_review";

export type EvidenceSufficiency = "enough" | "insufficient";

export type AnalysisEvidenceItem = {
  metric: string;
  value: string;
  source: string;
};

export type AnalysisConfidence = {
  score: number;
  level: "high" | "medium" | "low";
  reason: string;
};

export type AnalysisOutputBase = {
  confidence: AnalysisConfidence;
  evidence: AnalysisEvidenceItem[];
  evidenceSufficiency: EvidenceSufficiency;
  generatedAt: string;
};

export function isEvidenceSufficient(
  v: unknown
): v is EvidenceSufficiency {
  return v === "enough" || v === "insufficient";
}

export function validateAnalysisOutputBase(
  input: unknown
): AnalysisOutputBase | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const x = input as Record<string, unknown>;
  const confidence = x.confidence as Record<string, unknown> | undefined;
  if (!confidence) return null;
  const score = Number(confidence.score);
  const level = String(confidence.level ?? "");
  const reason = String(confidence.reason ?? "");
  if (!Number.isFinite(score) || score < 0 || score > 1) return null;
  if (level !== "high" && level !== "medium" && level !== "low") return null;
  if (!reason) return null;
  if (!Array.isArray(x.evidence)) return null;
  if (!isEvidenceSufficient(x.evidenceSufficiency)) return null;
  if (typeof x.generatedAt !== "string" || x.generatedAt.length < 8) return null;
  return x as AnalysisOutputBase;
}
