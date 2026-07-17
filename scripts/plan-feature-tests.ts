#!/usr/bin/env tsx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { SCENARIOS } from "../src/lib/evals/playthrough/scenarios";
import { featureDecisionWithConfidence, planAdaptiveFeatureTests, type FeatureEvidence, type FeatureId } from "../src/lib/evals/productQuality/adaptivePlanner";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? fallback : fallback; };
  const reportPath = resolve(get("--report", ".runtime-data/eval/product-quality-official-20260712.json"));
  const outputPath = resolve(get("--out", ".runtime-data/eval/next-feature-test-plan.json"));
  const maxCalls = Math.max(0, Number.parseInt(get("--max-calls", "12"), 10));
const report = JSON.parse(await readFile(reportPath, "utf8")) as { featureSignals?: Record<string, { touchedTurns?: number; progressionTurns?: number }> };
  const ids: FeatureId[] = ["tasks", "weapons", "combat", "codex", "economy", "profession", "location"];
  const evidence = Object.fromEntries(ids.map((id) => [id, { touchedTurns: report.featureSignals?.[id]?.touchedTurns ?? 0, progressionTurns: report.featureSignals?.[id]?.progressionTurns ?? 0 }])) as FeatureEvidence;
  const plan = planAdaptiveFeatureTests({ evidence, scenarios: SCENARIOS, maxCalls });
  const evidenceWithConfidence = Object.fromEntries(ids.map((id) => {
    const featureEvidence = evidence[id];
    const judgeReliability = report.featureSignals?.[id]?.judgeReliability;
    const parsedJudgeReliability = typeof judgeReliability === "number" && Number.isFinite(judgeReliability)
      ? Math.max(0, Math.min(1, judgeReliability))
      : null;
    const summary = featureDecisionWithConfidence(featureEvidence, parsedJudgeReliability);
    return [id, { ...featureEvidence, decision: summary.decision, confidence: summary.confidence, interval: summary.interval }];
  })) as Record<FeatureId, { touchedTurns: number; progressionTurns: number; decision: string; confidence: number; interval: { lower: number; upper: number } | null }>;
  const artifact = {
    generatedAt: new Date().toISOString(), reportPath, maxCalls,
    currentDecisions: evidenceWithConfidence,
    ...plan,
    stoppingRules: {
      minimumTouches: 20,
      keep: "Wilson 95% lower bound >= 0.30",
      simplifyExperiment: "Wilson 95% upper bound < 0.10",
      delete: "仅在简化实验候选通过随机 A/B 且留存、推进、满意度均不下降后考虑；自动报告不得直接删除。",
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(artifact, null, 2), "utf8");
  console.log(JSON.stringify(artifact, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
