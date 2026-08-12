import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { compareRagasBaseline, evaluateDeterministicRagasCase, summarizeRagasResults } from "@/lib/evals/ragas/metrics";
import { judgeRagasCase } from "@/lib/evals/ragas/judge";
import type { RagasBaseline, RagasCase } from "@/lib/evals/ragas/types";
import { buildModelJudgeScore, uploadScores } from "@/lib/observability/langfuse/scores";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const live = args.has("--live");
  const strict = args.has("--assert");
  const upload = args.has("--upload-langfuse");
  const jsonOutArg = process.argv[process.argv.indexOf("--json-out") + 1];
  const jsonOut = process.argv.includes("--json-out") ? jsonOutArg : ".runtime-data/eval/ragas.json";
  const cases = JSON.parse(await readFile(path.resolve("benchmarks/ragas/cases.json"), "utf8")) as RagasCase[];
  const baseline = JSON.parse(await readFile(path.resolve("benchmarks/ragas/baseline.json"), "utf8")) as RagasBaseline;

  const results = [];
  for (const testCase of cases) {
    const judged = live ? await judgeRagasCase(testCase) : [];
    results.push(evaluateDeterministicRagasCase(testCase, judged));
  }
  const summary = summarizeRagasResults(results);
  const baselineComparison = compareRagasBaseline(summary, baseline);
  const unavailable = Object.entries(summary.averages).filter(([, value]) => value === null).map(([name]) => name);
  const recommendations = [
    ...(summary.averages.context_precision !== null && summary.averages.context_precision < 0.7
      ? ["Review retrieval ranking/noise contexts; do not auto-edit source or deploy a repair."]
      : []),
    ...(baselineComparison.regressions.length
      ? [`Investigate baseline regressions: ${baselineComparison.regressions.join(", ")}.`]
      : []),
    ...(unavailable.length ? [`Run the authorized live judge for unavailable metrics: ${unavailable.join(", ")}.`] : []),
  ];
  const report = { generatedAt: new Date().toISOString(), mode: live ? "live" : "deterministic", summary, baselineComparison, recommendations, results };
  await mkdir(path.dirname(path.resolve(jsonOut)), { recursive: true });
  await writeFile(path.resolve(jsonOut), JSON.stringify(report, null, 2), "utf8");
  await writeFile(path.resolve(jsonOut.replace(/\.json$/i, ".md")), [
  "# VerseCraft RAGAS-compatible Evaluation",
  "",
  `- Version: ${summary.version}`,
  `- Mode: ${report.mode}`,
  `- Gate: ${summary.gatePass ? "PASS" : "FAIL / INSUFFICIENT"}`,
  `- Cases: ${summary.passed}/${summary.total}`,
  `- Baseline: ${baselineComparison.pass ? "PASS" : "REGRESSION"} (${baselineComparison.version}, tolerance ${baselineComparison.tolerance})`,
  "",
  ...Object.entries(summary.averages).map(([name, value]) => `- ${name}: ${value ?? "unavailable"}`),
  "",
  "## Baseline deltas",
  "",
  ...Object.entries(baselineComparison.deltas).map(([name, value]) => `- ${name}: ${value ?? "unavailable"}`),
  "",
  "## Non-mutating recommendations",
  "",
  ...(recommendations.length ? recommendations.map((item) => `- ${item}`) : ["- No regression recommendation."]),
  ].join("\n"), "utf8");

  if (upload) {
    const traceId = process.env.LANGFUSE_EVAL_TRACE_ID?.trim();
    if (!traceId) throw new Error("--upload-langfuse requires LANGFUSE_EVAL_TRACE_ID");
    const scores = Object.entries(summary.averages).flatMap(([name, value]) => value === null ? [] : [buildModelJudgeScore(`ragas.${name}`, value, true, `ragas-compatible:${summary.version}`)]);
    const uploadResult = await uploadScores(traceId, scores);
    if (uploadResult.failed > 0 || uploadResult.skipped) throw new Error(`Langfuse score upload was not accepted: ${JSON.stringify(uploadResult)}`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (strict && (!summary.gatePass || !baselineComparison.pass)) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
