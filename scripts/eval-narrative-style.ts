/**
 * eval:narrative-style — 薄壳（mock + live）
 *
 * Mock: 离线文风评测，纯函数
 * Live: judgeExecutor + DeepSeek 判官
 * 输出格式与迁移前兼容
 */

import fs from "node:fs";
import path from "node:path";
import {
  evaluateNarrativeStyleCase,
  summarizeNarrativeStyleEval,
  type NarrativeStyleCaseResult,
  type NarrativeStyleEvalCase,
} from "../src/lib/evals/narrativeStyleRubric";
import type {
  JudgeRubric,
  JudgeTarget,
  JudgeVerdict,
  MultiJudgeResult,
} from "../src/lib/evals/judge/types";
import { parseJudgeVerdict, aggregateMultiJudge } from "../src/lib/evals/judge/judgeExecutor";
import { buildJudgePrompt } from "../src/lib/evals/judge/judgePrompt";
import { callDeepSeekCompletion } from "../src/lib/evals/liveProvider";
import {
  parseEvalCli,
  evalLog,
  writeJson,
  appendHistory,
  resolveExperimentProvenance,
} from "../src/lib/evals/harness";

type CliOptions = {
  mode: "mock" | "live";
  assert: boolean;
  jsonOut: string | null;
  jsonOnly: boolean;
  casesPath?: string;
  input?: string;
  numJudges?: number;
  temperature?: number;
};

const NARRATIVE_STYLE_RUBRIC_PATH = path.resolve(
  __dirname, "..", "benchmarks", "judge", "rubrics", "narrative_style_v1.json"
);

let cachedRubric: JudgeRubric | null = null;

function getNarrativeStyleRubric(): JudgeRubric {
  if (cachedRubric) return cachedRubric;
  const content = fs.readFileSync(NARRATIVE_STYLE_RUBRIC_PATH, "utf8");
  cachedRubric = JSON.parse(content) as JudgeRubric;
  return cachedRubric;
}

const root = path.resolve(__dirname, "..");
const defaultCasesPath = path.join(root, "benchmarks", "narrative-style", "cases.json");

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const base = parseEvalCli(args, {
    modeEnv: "VC_EVAL_NARRATIVE_STYLE_MODE",
    assertEnv: "VC_EVAL_NARRATIVE_STYLE_ASSERT",
    jsonOutEnv: "VC_EVAL_NARRATIVE_STYLE_JSON_OUT",
  });

  if (base.mode === "live") {
    return {
      mode: "live",
      assert: base.assert,
      jsonOut: base.jsonOut,
      jsonOnly: base.jsonOnly,
      input: getArgValue(args, "--input") ?? process.env.VC_EVAL_NARRATIVE_STYLE_INPUT ?? "",
      numJudges: Number(getArgValue(args, "--num-judges")) || 1,
      temperature: Number(getArgValue(args, "--temperature")) || 0.3,
    };
  }

  return {
    mode: "mock",
    assert: base.assert,
    jsonOut: base.jsonOut,
    jsonOnly: base.jsonOnly,
    casesPath:
      getArgValue(args, "--cases-path") ??
      process.env.VC_EVAL_NARRATIVE_STYLE_CASES_PATH ??
      defaultCasesPath,
  };
}

// ─── Mock mode ────────────────────────────────────────

function loadMockCases(casesPath: string): NarrativeStyleEvalCase[] {
  return JSON.parse(fs.readFileSync(casesPath, "utf8")) as NarrativeStyleEvalCase[];
}

async function runMockMode(options: CliOptions): Promise<void> {
  const cp = options.casesPath!;
  const cases = loadMockCases(cp);
  const results: NarrativeStyleCaseResult[] = [];

  evalLog(options, `eval:narrative-style — mode=mock cases=${cases.length} path=${cp}`);

  for (let i = 0; i < cases.length; i += 1) {
    const testCase = cases[i]!;
    const result = evaluateNarrativeStyleCase(testCase);
    results.push(result);
    const passMark = result.pass ? "✔" : "✘";
    evalLog(
      options,
      `  ${passMark} ${result.id} (${result.kind}): issues=${result.report.issues.length} failures=${result.failures.length}${result.failures.length > 0 ? ` [${result.failures.join("; ")}]` : ""}`
    );
  }

  const summary = summarizeNarrativeStyleEval(results);
  const output = { mode: options.mode, casesPath: cp, summary, results };

  evalLog(
    options,
    `summary: total=${summary.total} pass=${summary.passCount} golden=${summary.goldenPassPass}/${summary.goldenPassCount} must_fail=${summary.mustFailPass}/${summary.mustFailCount} gate=${summary.gatePass ? "pass" : "fail"}`
  );

  await writeJson(options.jsonOut, output);

  const provenance = resolveExperimentProvenance();
  appendHistory({
    suite: "narrative-style",
    mode: options.mode,
    total: summary.total,
    pass: summary.passCount,
    passRate: summary.total > 0 ? summary.passCount / summary.total : 0,
    gate: summary.gatePass ? "pass" : "fail",
    timestamp: new Date().toISOString(),
    gitSha: provenance.commit,
    provenance,
  });

  if (options.jsonOnly) console.log(JSON.stringify(output, null, 2));
  if (options.assert && !summary.gatePass) process.exitCode = 1;
}

// ─── Live mode ─────────────────────────────────────────

interface LiveJudgeInputCase {
  id: string;
  scenario: string;
  narrative: string;
  userInput?: string;
  dmJson?: Record<string, unknown>;
  options?: string[];
  gameContext?: string;
}

interface LiveJudgeCaseResult {
  caseId: string;
  scenario: string;
  verdicts: JudgeVerdict[];
  aggregated: MultiJudgeResult;
}

async function judgeSingleCase(
  rubric: JudgeRubric,
  inputCase: LiveJudgeInputCase,
  numJudges: number,
  temperature: number
): Promise<LiveJudgeCaseResult | null> {
  const target: JudgeTarget = {
    caseId: inputCase.id,
    scenario: inputCase.scenario,
    narrative: inputCase.narrative,
    userInput: inputCase.userInput ?? "",
    dmJson: inputCase.dmJson ?? {},
    narrativeChars: inputCase.narrative.length,
    options: inputCase.options ?? [],
    gameContext: inputCase.gameContext,
  };

  const verdicts: JudgeVerdict[] = [];

  for (let j = 0; j < numJudges; j++) {
    const positionScheme = j === 0 ? "original" : j === 1 ? "reversed" : "random";
    const prompt = buildJudgePrompt({ rubric, target, positionScheme, chainOfThought: true });

    try {
      const response = await callDeepSeekCompletion({
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: prompt.userPrompt },
        ],
        temperature,
        maxTokens: 2048,
        jsonMode: true,
      });

      const verdict = parseJudgeVerdict({
        rubric,
        target,
        rawJudgeOutput: response.content,
        judgeModel: response.model,
        judgeRole: `judge-${j + 1}`,
        positionScheme,
      });

      if (verdict) verdicts.push(verdict);
    } catch {
      // Judge call failed — skip
    }
  }

  if (verdicts.length === 0) return null;

  const aggregated = aggregateMultiJudge({
    caseId: inputCase.id, scenario: inputCase.scenario, verdicts, rubric,
  });

  return { caseId: inputCase.id, scenario: inputCase.scenario, verdicts, aggregated };
}

async function runLiveMode(options: CliOptions): Promise<void> {
  if (!options.input) {
    console.error("Live mode requires --input <file> or VC_EVAL_NARRATIVE_STYLE_INPUT.");
    process.exitCode = 1;
    return;
  }

  const rubric = getNarrativeStyleRubric();
  const cases = JSON.parse(fs.readFileSync(path.resolve(options.input), "utf8")) as LiveJudgeInputCase[];

  evalLog(options, `eval:narrative-style — mode=live rubric=${rubric.name} v${rubric.version} cases=${cases.length} input=${options.input}`);
  evalLog(options, `Judge config: numJudges=${options.numJudges} temperature=${options.temperature}`);

  const results: LiveJudgeCaseResult[] = [];

  for (let i = 0; i < cases.length; i += 1) {
    const inputCase = cases[i]!;
    const result = await judgeSingleCase(rubric, inputCase, options.numJudges!, options.temperature!);
    if (!result) {
      evalLog(options, `  ✘ ${inputCase.id}: all judges failed`);
      continue;
    }
    results.push(result);

    const agg = result.aggregated;
    const dimScores = Object.entries(agg.consensusScores)
      .map(([dim, score]) => `${dim}=${score}`)
      .join(" ");
    evalLog(
      options,
      `  ${agg.passed ? "✔" : "✘"} ${inputCase.id}: overall=${agg.consensusOverall.toFixed(1)} agreement=${agg.interJudgeAgreement.toFixed(2)} votes=${agg.voteCount.pass}/${agg.voteCount.total} dims=[${dimScores}]`
    );
  }

  const totalCases = results.length;
  const passedCases = results.filter((r) => r.aggregated.passed).length;
  const passRate = totalCases > 0 ? passedCases / totalCases : 0;
  const averageOverallScore = totalCases > 0
    ? results.reduce((sum, r) => sum + r.aggregated.consensusOverall, 0) / totalCases : 0;

  const dimAccum: Record<string, { sum: number; count: number }> = {};
  for (const r of results) {
    for (const [dim, score] of Object.entries(r.aggregated.consensusScores)) {
      if (!dimAccum[dim]) dimAccum[dim] = { sum: 0, count: 0 };
      dimAccum[dim]!.sum += score;
      dimAccum[dim]!.count += 1;
    }
  }
  const dimensionAverages: Record<string, number> = {};
  for (const [dim, acc] of Object.entries(dimAccum)) {
    dimensionAverages[dim] = acc.count > 0 ? acc.sum / acc.count : 0;
  }

  const summary = {
    totalCases, passedCases, failedCases: totalCases - passedCases,
    passRate, averageOverallScore, dimensionAverages,
    gatePass: totalCases === results.length && passedCases === totalCases,
  };

  const output = {
    mode: options.mode,
    rubric: { id: rubric.id, name: rubric.name, version: rubric.version },
    judgeConfig: { numJudges: options.numJudges, temperature: options.temperature, judgeModel: "deepseek-chat" },
    summary, results,
  };

  evalLog(options, `summary: total=${summary.totalCases} passed=${summary.passedCases}/${summary.totalCases} rate=${(summary.passRate * 100).toFixed(0)}% avgScore=${summary.averageOverallScore.toFixed(2)} gate=${summary.gatePass ? "pass" : "fail"}`);

  await writeJson(options.jsonOut, output);

  const provenance = resolveExperimentProvenance();
  appendHistory({
    suite: "narrative-style",
    mode: options.mode,
    total: totalCases,
    pass: passedCases,
    passRate,
    gate: summary.gatePass ? "pass" : "fail",
    dimensions: dimensionAverages,
    timestamp: new Date().toISOString(),
    gitSha: provenance.commit,
    provenance,
  });

  if (options.jsonOnly) console.log(JSON.stringify(output, null, 2));
  if (options.assert && !summary.gatePass) process.exitCode = 1;
}

async function main(): Promise<void> {
  const options = parseCli();
  if (options.mode === "live") {
    await runLiveMode(options);
  } else {
    await runMockMode(options);
  }
}

void main();
