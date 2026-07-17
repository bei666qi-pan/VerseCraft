import type { Scenario } from "@/lib/evals/playthrough/scenarios";

export type FeatureId = "tasks" | "weapons" | "combat" | "codex" | "economy" | "profession" | "location";
export type FeatureEvidence = Record<FeatureId, { touchedTurns: number; progressionTurns: number }>;
export type FeatureDecision = "insufficient_evidence" | "keep" | "simplify_experiment_candidate" | "mixed";

export interface FeatureEvidenceStrength {
  label: "missing" | "weak" | "moderate" | "strong";
  touchedTurns: number;
  progressionTurns: number;
  progressionRate: number;
}

export interface FeatureDecisionSummary {
  decision: FeatureDecision;
  confidence: number;
  interval: { lower: number; upper: number } | null;
  evidence: FeatureEvidenceStrength;
  rationale: string[];
  actionability: "observe" | "simplify_experiment" | "keep";
}

export interface PlannedScenario {
  scenarioId: string;
  features: FeatureId[];
  maxSteps: number;
  estimatedCalls: number;
  informationGain: number;
  rationale: string;
}

const FEATURE_RULES: Record<FeatureId, RegExp> = {
  tasks: /task|quest|任务|差事/i,
  weapons: /weapon|武器|锻造|修复|stability|contamination/i,
  combat: /combat|战斗|威胁|hp_jump/i,
  codex: /codex|图鉴|npc-interaction|multi-npc/i,
  economy: /economy|trade|currency|originium|原石|商店/i,
  profession: /profession|职业|试炼|认证/i,
  location: /location|teleport|explore|speedrun|楼层|移动|逃生/i,
};

const KEEP_THRESHOLD = 0.30;
const SIMPLIFY_THRESHOLD = 0.10;
const STRONG_TRUST_TURNS = 40;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function decisionSafety(decision: FeatureDecision, interval: { lower: number; upper: number } | null): number {
  if (!interval) return 0;
  if (decision === "keep") {
    const safeGap = clamp01((interval.lower - KEEP_THRESHOLD) / 0.4);
    return safeGap;
  }
  if (decision === "simplify_experiment_candidate") {
    return clamp01((SIMPLIFY_THRESHOLD - interval.upper) / SIMPLIFY_THRESHOLD);
  }
  return 0;
}

export function inferScenarioFeatures(scenario: Scenario): FeatureId[] {
  const haystack = [scenario.id, scenario.name, scenario.description, ...scenario.criticalInvariants].join(" ");
  const inferred = (Object.keys(FEATURE_RULES) as FeatureId[]).filter((feature) => FEATURE_RULES[feature].test(haystack));
  return [...new Set([...(scenario.requiredFeatureOutcomes ?? []), ...inferred])] as FeatureId[];
}

export function wilsonInterval(successes: number, trials: number, z = 1.96): { lower: number; upper: number } | null {
  if (trials <= 0) return null;
  const p = Math.max(0, Math.min(trials, successes)) / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

export function featureDecision(evidence: { touchedTurns: number; progressionTurns: number }): FeatureDecision {
  if (evidence.touchedTurns < 20) return "insufficient_evidence";
  const interval = wilsonInterval(evidence.progressionTurns, evidence.touchedTurns)!;
  if (interval.lower >= KEEP_THRESHOLD) return "keep";
  if (interval.upper < SIMPLIFY_THRESHOLD) return "simplify_experiment_candidate";
  return "mixed";
}

function toFeatureEvidenceStrength(evidence: { touchedTurns: number; progressionTurns: number }): FeatureEvidenceStrength {
  const progressionTurns = Math.max(0, evidence.progressionTurns);
  const touchedTurns = Math.max(0, evidence.touchedTurns);
  const progressionRate = touchedTurns === 0 ? 0 : progressionTurns / touchedTurns;
  return {
    touchedTurns,
    progressionTurns,
    progressionRate,
    label: touchedTurns >= 30 ? "strong" : touchedTurns >= 10 ? "moderate" : touchedTurns >= 1 ? "weak" : "missing",
  };
}

export function featureDecisionWithConfidence(
  evidence: { touchedTurns: number; progressionTurns: number },
  judgeConfidence: number | null = null,
): FeatureDecisionSummary {
  const touchedTurns = Math.max(0, Math.round(Number(evidence.touchedTurns)));
  const progressionRaw = Math.max(0, Math.round(Number(evidence.progressionTurns)));
  const progressionTurns = Math.max(0, Math.min(progressionRaw, touchedTurns));
  const safeEvidence = { touchedTurns, progressionTurns };
  const decision = featureDecision(safeEvidence);
  const interval = safeEvidence.touchedTurns > 0 ? wilsonInterval(safeEvidence.progressionTurns, safeEvidence.touchedTurns) : null;
  const evidenceStrength = toFeatureEvidenceStrength(safeEvidence);
  const evidenceConfidence = safeEvidence.touchedTurns === 0
    ? 0
    : evidenceStrength.label === "strong"
      ? 0.9
      : evidenceStrength.label === "moderate"
        ? 0.7
        : evidenceStrength.label === "weak"
          ? 0.4
          : 0.1;
  const sampleReliability = clamp01(Math.log2(1 + safeEvidence.touchedTurns) / Math.log2(1 + STRONG_TRUST_TURNS));
  const intervalReliability = interval ? clamp01(1 - Math.max(0, interval.upper - interval.lower)) : 0;
  const decisionStrength = decisionSafety(decision, interval);
  const hasJudgeEvidence = judgeConfidence !== null;
  const judgeTerm = hasJudgeEvidence ? clamp01(judgeConfidence) : 0;
  const dataConfidence = 0.42 * intervalReliability + 0.22 * sampleReliability + 0.18 * evidenceConfidence + 0.08 * decisionStrength;
  const confidenceRaw = dataConfidence + (hasJudgeEvidence ? 0.1 * judgeTerm : 0);
  const confidence = Math.max(
    0,
    Math.min(1, confidenceRaw * (hasJudgeEvidence ? 1 : 0.8)),
  );
  const rationale = [
    `touched=${safeEvidence.touchedTurns}`,
    `progression=${safeEvidence.progressionTurns}`,
    `progressionRate=${evidenceStrength.progressionRate.toFixed(2)}`,
    interval === null ? "interval=n/a" : `interval=[${interval.lower.toFixed(3)},${interval.upper.toFixed(3)}]`,
    `evidenceLabel=${evidenceConfidence.toFixed(2)}`,
    `judgeConfidence=${judgeTerm.toFixed(2)}${judgeConfidence === null ? "(missing)" : ""}`,
    `decisionStrength=${decisionStrength.toFixed(2)}`,
    `sampleReliability=${sampleReliability.toFixed(2)}`,
    `intervalReliability=${intervalReliability.toFixed(2)}`,
    `hasJudgeEvidence=${String(hasJudgeEvidence)}`,
  ];
  const actionability = decision === "keep" ? "keep" : decision === "simplify_experiment_candidate" ? "simplify_experiment" : "observe";
  return { decision, confidence, interval, evidence: evidenceStrength, rationale, actionability };
}

export function planAdaptiveFeatureTests(args: {
  evidence: FeatureEvidence;
  scenarios: Scenario[];
  maxCalls: number;
  maxStepsPerScenario?: number;
}): { plans: PlannedScenario[]; estimatedCalls: number; uncoveredFeatures: FeatureId[] } {
  const maxSteps = Math.max(1, Math.min(12, args.maxStepsPerScenario ?? 6));
  let remaining = Math.max(0, Math.floor(args.maxCalls));
  const deficits = Object.fromEntries((Object.keys(args.evidence) as FeatureId[]).map((feature) => [feature, Math.max(0, 20 - args.evidence[feature].touchedTurns)])) as Record<FeatureId, number>;
  const candidates = args.scenarios.filter((scenario) => (scenario.scriptedActions?.length ?? 0) > 0).map((scenario) => {
    const features = inferScenarioFeatures(scenario).filter((feature) => deficits[feature] > 0);
    const estimatedCalls = Math.min(maxSteps, Math.max(1, scenario.scriptedActions?.length ?? maxSteps));
    const informationGain = features.reduce((sum, feature) => sum + deficits[feature], 0) / estimatedCalls;
    const verificationStrength = scenario.requiredFeatureOutcomes?.length ?? 0;
    return { scenario, features, estimatedCalls, informationGain, verificationStrength };
  }).filter((candidate) => candidate.features.length > 0).sort((a, b) =>
    b.informationGain - a.informationGain
    || b.verificationStrength - a.verificationStrength
    || a.estimatedCalls - b.estimatedCalls
  );

  const plans: PlannedScenario[] = [];
  for (const candidate of candidates) {
    if (candidate.estimatedCalls > remaining) continue;
    if (!candidate.features.some((feature) => deficits[feature] > 0)) continue;
    plans.push({
      scenarioId: candidate.scenario.id,
      features: candidate.features,
      maxSteps: candidate.estimatedCalls,
      estimatedCalls: candidate.estimatedCalls,
      informationGain: candidate.informationGain,
      rationale: candidate.features.map((feature) => `${feature}:还缺${deficits[feature]}次触达`).join("；"),
    });
    remaining -= candidate.estimatedCalls;
    for (const feature of candidate.features) deficits[feature] = Math.max(0, deficits[feature] - candidate.estimatedCalls);
  }
  return {
    plans,
    estimatedCalls: args.maxCalls - remaining,
    uncoveredFeatures: (Object.keys(deficits) as FeatureId[]).filter((feature) => deficits[feature] > 0),
  };
}
