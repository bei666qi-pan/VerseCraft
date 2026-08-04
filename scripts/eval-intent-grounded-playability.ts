#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { envBoolean } from "../src/lib/config/envRaw";
import {
  INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION,
  evaluateIntentGroundedCandidate,
  lintIntentGroundedCorpus,
  summarizeIntentGroundedVerdicts,
  type IntentGroundedCase,
  type IntentGroundedCorpus,
  type IntentOracleVerdict,
} from "../src/lib/evals/intentGroundedPlayability";
import type { ModelNarrativeReviewTarget } from "../src/lib/evals/modelNarrativeReview";
import { appendHistory, evalLog, parseEvalCli, writeJson, resolveExperimentProvenance } from "../src/lib/evals/harness";
import type { PlayerControlPlane } from "../src/lib/playRealtime/types";

for (const name of [".env", ".env.local"]) {
  const candidate = path.resolve(process.cwd(), name);
  if (fs.existsSync(candidate)) loadEnv({ path: candidate, override: false });
}

function arg(values: string[], key: string): string | null {
  const inline = values.find((value) => value.startsWith(`${key}=`));
  if (inline) return inline.slice(key.length + 1);
  const at = values.indexOf(key);
  return at >= 0 ? values[at + 1] ?? null : null;
}

const args = process.argv.slice(2);
const cli = parseEvalCli(args, { modeEnv: "VC_EVAL_INTENT_GROUNDED_PLAYABILITY_MODE" });
const input = arg(args, "--input") ?? "benchmarks/intent-grounded-playability/cases.json";
const markdownOut = arg(args, "--markdown-out");
const traceInput = arg(args, "--trace");
const assertStrict = args.includes("--assert-strict");
const timeoutMs = Math.max(1_000, Math.min(30_000, Number(arg(args, "--timeout-ms") ?? "12000")));
const parallelism = Math.max(1, Math.min(6, Number(arg(args, "--parallel") ?? "1")));
const selectedCaseIds: string[] = [];
for (let index = 0; index < args.length; index += 1) {
  const value = args[index] ?? "";
  if (value.startsWith("--case=")) selectedCaseIds.push(value.slice(7));
  else if (value === "--case" && args[index + 1]) selectedCaseIds.push(args[index + 1]!);
}

type ExpressionResult = {
  caseId: string;
  expressionId: string;
  text: string;
  source: "cache" | "fast_path" | "model" | "unavailable" | "not_run";
  control: PlayerControlPlane | null;
  latencyMs: number;
  verdict: IntentOracleVerdict;
  error?: string;
};

function playerContext(testCase: IntentGroundedCase): string {
  return ["当前地点：受测场景", "仅可依据以下已知事实：", ...testCase.sceneFacts.map((fact) => `- ${fact}`)].join("\n");
}

async function evaluateExpression(testCase: IntentGroundedCase, expression: IntentGroundedCase["expressions"][number], index: number): Promise<ExpressionResult> {
  if (cli.mode !== "live") {
    return {
      caseId: testCase.id,
      expressionId: expression.id,
      text: expression.text,
      source: "not_run",
      control: null,
      latencyMs: 0,
      verdict: { status: "inconclusive", issues: [{ code: "non_model_evidence", message: "live mode was not requested" }] },
    };
  }
  if (!envBoolean("VERSECRAFT_ENABLE_INTENT_GROUNDED_PLAYABILITY_EVALS", false)) {
    return {
      caseId: testCase.id,
      expressionId: expression.id,
      text: expression.text,
      source: "not_run",
      control: null,
      latencyMs: 0,
      verdict: { status: "inconclusive", issues: [{ code: "non_model_evidence", message: "feature flag is disabled" }] },
    };
  }
  // Dynamic import happens after dotenv has populated process.env. The router
  // resolves task policy at module load, so a static import here could turn a
  // correctly configured standalone CLI into a false NO_CREDENTIALS result.
  const { evaluateControlWithLiveModel } = await import("../src/lib/evals/controlModelLiveEval");
  const result = await evaluateControlWithLiveModel({
    latestUserInput: expression.text,
    playerContext: playerContext(testCase),
    ruleSnapshot: testCase.ruleSnapshot,
    requestId: `intent-grounded-${testCase.id}-${expression.id}-${index}`,
    sessionId: `intent-grounded-${testCase.id}-${index}`,
    timeoutMs,
  });
  const source = result.source;
  const control = result.ok ? result.control : null;
  return {
    caseId: testCase.id,
    expressionId: expression.id,
    text: expression.text,
    source,
    control,
    latencyMs: result.latencyMs,
    error: result.ok ? undefined : [result.error, result.detail].filter(Boolean).join(":"),
    verdict: evaluateIntentGroundedCandidate({ testCase, expression, control, source }),
  };
}

function wilsonInterval(successes: number, total: number): { lower: number; upper: number } | null {
  if (total <= 0) return null;
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + z ** 2 / total;
  const center = (p + z ** 2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function sameGroupVerdict(rows: ExpressionResult[]): boolean {
  return rows.length > 0 && rows.every((row) => row.verdict.status === "pass");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function visibleOptionsForTraceStep(step: Record<string, unknown>): {
  options: string[];
  optionsSource: "main_turn" | "client_regenerated";
  clientOptionRegeneration?: Record<string, unknown>;
} {
  const dmJson = asRecord(step.dmJson);
  const regeneration = asRecord(step.clientOptionRegeneration);
  const regeneratedOptions = Array.isArray(regeneration.options)
    ? regeneration.options.filter((option): option is string => typeof option === "string")
    : [];
  const regenerationApplied =
    regeneration.source === "api_chat_options_regen_only" &&
    regeneration.applied === true &&
    regeneratedOptions.length >= 2 &&
    regeneratedOptions.length <= 4;
  const mainOptions = Array.isArray(dmJson.options)
    ? dmJson.options.filter((option): option is string => typeof option === "string")
    : [];
  return {
    options: regenerationApplied ? regeneratedOptions : mainOptions,
    optionsSource: regenerationApplied ? "client_regenerated" : "main_turn",
    ...(Object.keys(regeneration).length > 0 ? { clientOptionRegeneration: regeneration } : {}),
  };
}

type E2eReviewResult = Awaited<ReturnType<(typeof import("../src/lib/evals/modelNarrativeReview"))["reviewModelNarrative"]>>;

async function traceReview(tracePath: string, corpus: IntentGroundedCorpus): Promise<E2eReviewResult | null> {
  const raw = JSON.parse(fs.readFileSync(path.resolve(tracePath), "utf8")) as Record<string, unknown>;
  const steps = Array.isArray(raw.steps) ? raw.steps as Array<Record<string, unknown>> : [];
  const action = typeof steps[0]?.playerAction === "string" ? steps[0].playerAction : "";
  const matched = corpus.cases.find((testCase) => testCase.expressions.some((expression) => expression.text === action));
  if (!matched || steps.length === 0) return null;
  const target: ModelNarrativeReviewTarget = {
    caseId: `e2e-${matched.id}`,
    scenario: `真实 /api/chat 抽样：${matched.id}`,
    permittedFacts: matched.sceneFacts.map((text, index) => ({ id: `${matched.id}-fact-${index + 1}`, text })),
    steps: steps.map((step, index) => {
      const visibleOptions = visibleOptionsForTraceStep(step);
      return {
        stepIndex: typeof step.stepIndex === "number" ? step.stepIndex : index,
        playerAction: typeof step.playerAction === "string" ? step.playerAction : "",
        narrative: typeof step.narrative === "string" ? step.narrative : "",
        ...visibleOptions,
        dmJson: asRecord(step.dmJson),
        stateBefore: index === 0 ? (raw.initialState as Record<string, unknown> | undefined) : (steps[index - 1]?.stateSnapshot as Record<string, unknown> | undefined),
        stateAfter: step.stateSnapshot as Record<string, unknown> | undefined,
      };
    }),
  };
  const { reviewModelNarrative } = await import("../src/lib/evals/modelNarrativeReview");
  return reviewModelNarrative(target, { liveRequested: cli.mode === "live" });
}

function markdown(output: Record<string, unknown>): string {
  const summary = output.summary as Record<string, number | boolean>;
  const interval = output.wilson95 as { lower: number; upper: number } | null;
  const rows = output.results as ExpressionResult[];
  return [
    "# Intent-grounded playability evaluation",
    "",
    `- 语料版本：\`${INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION}\``,
    `- 模式：${output.mode}`,
    `- Live model coverage：${(Number(summary.liveCoverage ?? 0) * 100).toFixed(1)}%`,
    `- 通过/失败/不可判定：${summary.passed}/${summary.failed}/${summary.inconclusive}`,
    `- 等价表达组：${summary.consistentGroups}/${summary.totalGroups} 通过`,
    `- 严格 gate：${summary.strictGatePass ? "pass" : "fail"}`,
    `- 受测样本 Wilson 95% 区间：${interval ? `${(interval.lower * 100).toFixed(1)}%–${(interval.upper * 100).toFixed(1)}%` : "N/A"}`,
    "- 解释：区间只描述本次固定语料上的观察率；它不证明所有叙事、世界状态、模型版本或任意自然语言输入可玩。",
    "",
    "| Case | Expression | Source | Verdict | Evidence |",
    "|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.caseId} | ${row.expressionId} | ${row.source} | ${row.verdict.status} | ${row.verdict.issues.map((issue) => issue.code).join(", ") || "—"} |`),
  ].join("\n") + "\n";
}

async function main(): Promise<void> {
  const source = JSON.parse(fs.readFileSync(path.resolve(input), "utf8")) as IntentGroundedCorpus;
  const corpusErrors = lintIntentGroundedCorpus(source);
  if (corpusErrors.length > 0) throw new Error(`invalid corpus:\n${corpusErrors.join("\n")}`);
  const cases = selectedCaseIds.length === 0 ? source.cases : source.cases.filter((testCase) => selectedCaseIds.includes(testCase.id));
  if (cases.length === 0) throw new Error("--case did not match any corpus case");
  const jobs = cases.flatMap((testCase) => testCase.expressions.map((expression) => ({ testCase, expression })));
  const results = new Array<ExpressionResult>(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallelism, jobs.length) }, async () => {
    while (true) {
      const index = next++;
      const job = jobs[index];
      if (!job) return;
      const result = await evaluateExpression(job.testCase, job.expression, index);
      results[index] = result;
      evalLog(cli, `${result.caseId}/${result.expressionId}: ${result.source} ${result.verdict.status}`);
    }
  }));
  const baseSummary = summarizeIntentGroundedVerdicts(results.map((row) => row.verdict));
  const liveCount = results.filter((row) => row.source === "model").length;
  const groups = cases.map((testCase) => results.filter((row) => row.caseId === testCase.id));
  const consistentGroups = groups.filter(sameGroupVerdict).length;
  const e2e = traceInput ? await traceReview(traceInput, source) : null;
  const e2eSummary = e2e ? (await import("../src/lib/evals/modelNarrativeReview")).summarizeModelNarrativeReviews([e2e]) : null;
  const strictGatePass = baseSummary.strictGatePass && liveCount === results.length && consistentGroups === groups.length && (!traceInput || Boolean(e2eSummary?.strictGatePass));
  const output = {
    suite: "intent-grounded-playability",
    corpusVersion: INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION,
    mode: cli.mode,
    parallelism,
    selectedCaseIds: selectedCaseIds.length === 0 ? null : selectedCaseIds,
    input,
    evidenceClass: cli.mode === "live" ? "model_candidate_plus_deterministic_oracle" : "corpus_oracle_only_not_playability_proof",
    corpusErrors,
    summary: { ...baseSummary, liveCoverage: results.length === 0 ? 0 : liveCount / results.length, totalGroups: groups.length, consistentGroups, strictGatePass },
    wilson95: wilsonInterval(baseSummary.passed, baseSummary.total),
    e2e: traceInput ? { trace: traceInput, matchedAndReviewed: Boolean(e2e), review: e2e, strictGatePass: e2eSummary?.strictGatePass ?? false } : null,
    results,
  };
  writeJson(cli.jsonOut, output);
  if (markdownOut) {
    fs.mkdirSync(path.dirname(path.resolve(markdownOut)), { recursive: true });
    fs.writeFileSync(path.resolve(markdownOut), markdown(output as unknown as Record<string, unknown>), "utf8");
  }
  const provenance = resolveExperimentProvenance();
  appendHistory({ suite: "intent-grounded-playability", mode: cli.mode, total: baseSummary.total, pass: baseSummary.passed, passRate: baseSummary.total === 0 ? 0 : baseSummary.passed / baseSummary.total, gate: strictGatePass ? "pass" : "fail", dimensions: { liveCoverage: results.length === 0 ? 0 : liveCount / results.length, inconclusive: baseSummary.inconclusive, consistentGroups }, timestamp: new Date().toISOString(), gitSha: provenance.commit, provenance });
  if (assertStrict && !strictGatePass) process.exitCode = 1;
}

void main();
