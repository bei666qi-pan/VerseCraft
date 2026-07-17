export type EvidenceStrength = "strong" | "moderate" | "weak" | "missing";

export interface ProductQualitySignals {
  runs: number;
  turns: number;
  passRate: number;
  softlockRate: number;
  errorRate: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  narrativeScore5: number | null;
  /** 裁判原始置信（0-1），通常来自模型/Codex 裁判输出的第一手置信值。 */
  narrativeJudgeConfidenceRaw?: number;
  narrativeJudgeConfidence: number;
  repetitionRate: number | null;
  worldConsistencyIssueTurnRate: number | null;
  progressionTurnRate: number | null;
  agencyResponseRate: number | null;
  meaningfulChoiceRate: number | null;
  structuredConsequenceRate: number | null;
  deadTurnRate: number | null;
  tokenInput: number | null;
  tokenOutput: number | null;
  /** Input tokens served from provider cache; this is a subset of tokenInput. */
  tokenCachedInput?: number | null;
  /** Miss-input-equivalent token cost under an explicitly named price profile. */
  tokenCostEquivalent?: number | null;
  tokenCostProfile?: string | null;
  tokenCoveredTurns: number;
  tokenCoverageRate: number;
  /** 叙事裁判置信度样本量（仅用于稀疏样本降权）。 */
  narrativeJudgeConfidenceSampleCount?: number;
  /** 仅 model/codex 的叙事裁判置信度样本量。 */
  narrativeJudgeConfidenceTrustedSampleCount?: number;
  /** 叙事裁判置信度覆盖率（有裁判分数的回合 / 有 conclusive 回合）。 */
  narrativeJudgeConfidenceCoverage?: number;
  /** 高可信来源（model/codex）叙事裁判置信度覆盖率。 */
  trustedNarrativeJudgeConfidenceCoverage?: number;
  /** 叙事裁判覆盖样本的通过率。 */
  judgePassRate?: number;
  /** 叙事裁判覆盖样本数。 */
  judgePassRuns?: number;
  /** 叙事裁判通过率一致性（与 live mock 对账）。 */
  judgePassAgreementRate?: number | null;
  /** Codex 复核一致率。 */
  judgeCodexAgreementRate?: number | null;
}

export interface QualityDimension {
  id: "reliability" | "performance" | "playability" | "narrative" | "costEfficiency";
  score: number | null;
  weight: number;
  evidence: EvidenceStrength;
  reasons: string[];
}

export interface ConfidenceTrace {
  source: "raw_ai" | "judge_coverage_inferred" | "heuristic_only";
  rawEvidenceUsed: boolean;
  evidenceComponents: Array<{
    name: string;
    value: number;
    weight: number;
    note: string;
  }>;
  confidencePathPenaltyReason: string[];
  evidenceFloor: number;
  evidenceSummary: {
    sampleRuns: number;
    turnSamples: number;
    judgeCoverageRuns: number;
    judgeConfidenceSamples: number;
    trustedJudgeConfidenceSamples: number;
    judgePassRate: number | null;
    judgePassAgreementRate: number | null;
    judgeCodexAgreementRate: number | null;
  };
}

export interface ProductQualityScorecard {
  version: "product-quality-v1";
  overallScore: number | null;
  confidence: number;
  confidenceTrace: ConfidenceTrace;
  dimensions: QualityDimension[];
  blockers: string[];
  recommendations: string[];
}
