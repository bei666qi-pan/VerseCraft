/**
 * Harness — 统一评测管线
 *
 * 提供所有 eval: 脚本共享的 runSuite 函数。
 * 各 suite 只需实现：
 *   1. loadCases() → EvalCase[]
 *   2. runCase(case, mode) → EvalResult
 *   3. scoring logic（可选，可复用内置 Scorer）
 *
 * 用法：
 *   import { runSuite, parseEvalCli, evalLog, writeJson } from "../src/lib/evals/harness";
 *
 *   const options = parseEvalCli();
 *   const results = await runSuite(options, {
 *     suite: "my-suite",
 *     mode: options.mode,
 *     loadCases: () => loadMyCases(),
 *     runCase: async (c, i) => runMyCase(c, i),
 *     summarize: (rs) => mySummarizer(rs),
 *   });
 */

import type { EvalCliOptions } from "./utils";
import { evalLog, writeJson, appendHistory, getGitSha, buildEvalOutput } from "./utils";
import type { EvalSummaryBase, EvalResultBase, ReportEntry } from "./types";

export interface SuiteRunner<TCase, TResult extends EvalResultBase> {
  suite: string;
  loadCases(): TCase[];
  runCase(testCase: TCase, index: number, mode: "mock" | "live"): Promise<TResult>;
  summarize(results: TResult[]): EvalSummaryBase & { dimensions?: Record<string, number> };
  /** 可选的预热函数（mock 首轮 warmup） */
  warmup?(baseUrl: string): Promise<void>;
  /** 可选的 summary 输出额外信息 */
  extraSummary?: Record<string, unknown>;
}

export interface SuiteRunOutput<TResult> {
  mode: "mock" | "live";
  summary: EvalSummaryBase;
  results: TResult[];
  rawOutput: Record<string, unknown>;
}

/**
 * 运行一个评测 suite。
 *
 * 自动处理：
 * - 预热
 * - 逐 case 运行并打印日志
 * - 汇总 + 门禁判断
 * - 双写：全量 JSON + 历史聚合行
 */
export async function runSuite<TCase, TResult extends EvalResultBase>(
  options: EvalCliOptions,
  runner: SuiteRunner<TCase, TResult>
): Promise<SuiteRunOutput<TResult>> {
  const cases = runner.loadCases();
  const results: TResult[] = [];

  evalLog(options, `Running ${runner.suite}: mode=${options.mode} cases=${cases.length}`);

  // Warmup（mock 模式第一轮）
  if (options.mode === "mock" && runner.warmup && cases.length > 0) {
    await runner.warmup("").catch(() => {});
  }

  for (let i = 0; i < cases.length; i += 1) {
    const result = await runner.runCase(cases[i]!, i, options.mode);
    results.push(result);

    // 日志输出
    const failMsg =
      result.failures.length > 0 ? ` failures=${result.failures.join(",")}` : "";
    evalLog(options, `  ${result.caseId}: pass=${result.pass ? 1 : 0}${failMsg}`);
  }

  const summary = runner.summarize(results);
  const gateMsg = summary.gate === "pass" ? "pass" : "fail";
  evalLog(options, `summary: total=${summary.total} pass=${summary.pass} gate=${gateMsg}`);

  // 构建输出
  const output = buildEvalOutput({
    mode: options.mode,
    suite: runner.suite,
    summary,
    results,
    extra: runner.extraSummary,
  });

  // 写入全量 JSON
  writeJson(options.jsonOut, output);

  // 写入历史聚合行
  appendHistory({
    suite: runner.suite,
    mode: options.mode,
    total: summary.total,
    pass: summary.pass,
    passRate: summary.passRate,
    gate: summary.gate,
    dimensions: summary.dimensions,
    timestamp: summary.timestamp,
    gitSha: getGitSha(),
  });

  // jsonOnly 模式额外输出到 stdout
  if (options.jsonOnly) console.log(JSON.stringify(output, null, 2));

  // 门禁判定
  if (options.assert && summary.gate !== "pass") process.exitCode = 1;

  return { mode: options.mode, summary, results, rawOutput: output };
}
