/**
 * Chat Quality Eval — 薄壳
 *
 * 核心逻辑（probeChatSse + evaluateChatQualityCase）保持不变。
 * CLI/日志/输出/历史由 harness 接管，输出格式与迁移前兼容。
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import { probeChatSse } from "../src/lib/perf/chatSseProbe";
import {
  evaluateChatQualityCase,
  summarizeChatQualityEval,
  type ChatEvalCase,
  type ChatEvalCaseResult,
} from "../src/lib/evals/chatQualityRubric";
import { parseEvalCli, evalLog, writeJson, appendHistory, resolveExperimentProvenance } from "../src/lib/evals/harness";

type EvalMode = "mock" | "live";

type CliOptions = {
  mode: EvalMode;
  assert: boolean;
  jsonOut: string | null;
  jsonOnly: boolean;
};

const root = path.resolve(__dirname, "..");
const defaultCasesPath = path.join(root, "benchmarks", "llm-evals", "cases.json");

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const base = parseEvalCli(args, {
    modeEnv: "VC_EVAL_CHAT_MODE",
    assertEnv: "VC_EVAL_CHAT_ASSERT",
    jsonOutEnv: "VC_EVAL_CHAT_JSON_OUT",
  });
  return {
    mode: base.mode,
    assert: base.assert,
    jsonOut: base.jsonOut,
    jsonOnly: base.jsonOnly,
  };
}

function loadCases(path: string): ChatEvalCase[] {
  return JSON.parse(readFileSync(path, "utf8")) as ChatEvalCase[];
}

async function runCase(baseUrl: string, mode: EvalMode, testCase: ChatEvalCase, index: number): Promise<ChatEvalCaseResult> {
  const requestId = `eval-${mode}-${testCase.id}-${Date.now()}`;
  const marker = mode === "mock" && testCase.mockScenario ? `[mock_scenario:${testCase.mockScenario}] ` : "";
  const content = `${marker}${testCase.latestUserInput}`;
  const metrics = await probeChatSse({
    baseUrl,
    timeoutMs: 120_000,
    headers: {
      Accept: "text/event-stream",
      "X-VerseCraft-Request-Id": requestId,
      "X-Forwarded-For": `127.0.2.${(index % 200) + 20}`,
      ...(mode === "mock" ? { "X-VerseCraft-Expected-Options-Count": String(testCase.expect.optionsCount) } : {}),
    },
    body: {
      latestUserInput: content,
      messages: [{ role: "user", content }],
      playerContext: testCase.playerContext,
      sessionId: requestId,
    },
  });
  return evaluateChatQualityCase(testCase, metrics);
}

async function main(): Promise<void> {
  const options = parseCli();
  if (options.mode === "live" && process.env.E2E_AI_LIVE !== "1") {
    console.error("Live eval requires E2E_AI_LIVE=1.");
    process.exitCode = 1;
    return;
  }

  const baseUrl = process.env.BENCHMARK_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:666";
  const cases = loadCases(defaultCasesPath);
  const results: ChatEvalCaseResult[] = [];

  evalLog(options, `Running chat quality eval: mode=${options.mode} cases=${cases.length} baseUrl=${baseUrl}`);

  if (options.mode === "mock" && cases[0]) {
    await runCase(baseUrl, options.mode, cases[0], 10_000).catch(() => null);
  }

  for (let i = 0; i < cases.length; i += 1) {
    const testCase = cases[i]!;
    const result = await runCase(baseUrl, options.mode, testCase, i);
    results.push(result);
    evalLog(
      options,
      `  ${result.id}: json=${result.jsonPass ? 1 : 0} narrative=${result.narrativePass ? 1 : 0} options=${
        result.optionsPass ? 1 : 0
      } optionQuality=${result.optionQualityPass ? 1 : 0} latency=${result.latencyBudgetPass ? 1 : 0}${
        result.failures.length > 0 ? ` failures=${result.failures.join(",")}` : ""
      }`
    );
  }

  const summary = summarizeChatQualityEval(results);
  const output = {
    mode: options.mode,
    baseUrl,
    thresholds: {
      jsonPassRate: 1,
      narrativePassRate: 0.95,
      optionsPassRate: 0.98,
      optionQualityPassRate: 0.95,
      leakagePassRate: 1,
      severeErrorCount: 0,
    },
    summary,
    results,
  };

  evalLog(
    options,
    `summary: json=${summary.jsonPassRate.toFixed(3)} narrative=${summary.narrativePassRate.toFixed(
      3
    )} options=${summary.optionsPassRate.toFixed(3)} optionQuality=${summary.optionQualityPassRate.toFixed(
      3
    )} leakage=${summary.leakagePassRate.toFixed(3)} latency=${summary.latencyBudgetPassRate.toFixed(
      3
    )} severe=${summary.severeErrorCount} score=${summary.overallScore.toFixed(3)} gate=${
      summary.gatePass ? "pass" : "fail"
    }`
  );

  // 写入 JSON（向后兼容格式）
  await writeJson(options.jsonOut, output);

  // 写入历史聚合行
  const provenance = resolveExperimentProvenance();
  appendHistory({
    suite: "chat-quality",
    mode: options.mode,
    total: results.length,
    pass: summary.gatePass ? results.length : 0,
    passRate: summary.overallScore,
    gate: summary.gatePass ? "pass" : "fail",
    dimensions: {
      jsonPassRate: summary.jsonPassRate,
      narrativePassRate: summary.narrativePassRate,
      optionsPassRate: summary.optionsPassRate,
      leakagePassRate: summary.leakagePassRate,
    },
    timestamp: new Date().toISOString(),
    gitSha: provenance.commit,
    provenance,
  });

  if (options.jsonOnly) console.log(JSON.stringify(output, null, 2));
  if (options.assert && !summary.gatePass) process.exitCode = 1;
}

void main();
