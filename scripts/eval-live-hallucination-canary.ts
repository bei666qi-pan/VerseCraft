#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { probeChatSse, type ChatSseProbeMetrics } from "../src/lib/perf/chatSseProbe";
import {
  evaluateNarrativeSafetyCase,
  summarizeNarrativeSafetyEval,
  type NarrativeSafetyCaseResult,
  type NarrativeSafetyEvalCase,
} from "../src/lib/evals/narrativeSafetyRubric";
import { appendHistory, getGitSha } from "../src/lib/evals/harness";
import { tryConsumeBudget } from "../src/lib/evals/harness/budgetGuard";
import {
  sanitizeDenialAwareFinalJson,
} from "../src/lib/evals/denialDetection";

for (const name of [".env", ".env.local"]) {
  const candidate = path.resolve(process.cwd(), name);
  if (fs.existsSync(candidate)) loadEnv({ path: candidate, override: false });
}

const DEFAULT_CASE_IDS = [
  "unknown_npc_silver_girl",
  "forbidden_npc_knowledge",
  "unsupported_relationship",
  "unknown_item_acquisition",
] as const;

function readOption(args: string[], name: string): string | null {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function readRepeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index] ?? "";
    if (value.startsWith(`${name}=`)) values.push(value.slice(name.length + 1));
    else if (value === name && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

function clampInteger(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

type CanaryResult = NarrativeSafetyCaseResult & {
  sampleIndex: number;
  denialAwareIgnoredTerms: string[];
};

async function runCase(args: {
  baseUrl: string;
  testCase: NarrativeSafetyEvalCase;
  caseIndex: number;
  sampleIndex: number;
}): Promise<CanaryResult> {
  const requestId = `live-hallucination-${args.testCase.id}-${args.sampleIndex}-${Date.now()}`;
  const metrics = await probeChatSse({
    baseUrl: args.baseUrl,
    timeoutMs: 120_000,
    headers: {
      Accept: "text/event-stream",
      "X-VerseCraft-Request-Id": requestId,
      "X-Forwarded-For": `127.0.7.${(args.caseIndex % 200) + 20}`,
    },
    body: {
      latestUserInput: args.testCase.latestUserInput,
      messages: [{ role: "user", content: args.testCase.latestUserInput }],
      playerContext: args.testCase.playerContext,
      sessionId: requestId,
      ...(args.testCase.clientState === undefined ? {} : { clientState: args.testCase.clientState }),
    },
  });

  const denialAware = sanitizeDenialAwareFinalJson(args.testCase, metrics.finalJson);
  const denialAwareMetrics: ChatSseProbeMetrics = { ...metrics, finalJson: denialAware.finalJson };
  return {
    ...evaluateNarrativeSafetyCase(args.testCase, denialAwareMetrics),
    sampleIndex: args.sampleIndex,
    denialAwareIgnoredTerms: denialAware.ignoredTerms,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const baseUrl = readOption(args, "--base-url")
    ?? process.env.BENCHMARK_BASE_URL
    ?? process.env.PLAYWRIGHT_BASE_URL
    ?? "http://127.0.0.1:666";
  const casesPath = path.resolve(readOption(args, "--cases") ?? "benchmarks/narrative-safety/cases.json");
  const outPath = path.resolve(readOption(args, "--json-out") ?? ".runtime-data/live-hallucination-canary.json");
  const repeat = clampInteger(readOption(args, "--repeat"), 1, 1, 3);
  const requestedIds = readRepeatedOption(args, "--case");
  const selectedIds = requestedIds.length > 0 ? requestedIds : [...DEFAULT_CASE_IDS];

  const allCases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as NarrativeSafetyEvalCase[];
  const casesById = new Map(allCases.map((testCase) => [testCase.id, testCase]));
  const selectedCases = selectedIds.map((id) => {
    const testCase = casesById.get(id);
    if (!testCase) throw new Error(`Unknown narrative safety case: ${id}`);
    return testCase;
  });

  const plannedCalls = selectedCases.length * repeat;
  if (plannedCalls <= 0) throw new Error("Live hallucination canary selected no cases.");
  if (dryRun) {
    console.log(JSON.stringify({ selectedCaseIds: selectedIds, repeat, plannedCalls, casesPath }, null, 2));
    return;
  }
  if (process.env.E2E_AI_LIVE !== "1") {
    throw new Error("Live hallucination canary requires E2E_AI_LIVE=1.");
  }
  if (!tryConsumeBudget("live_hallucination_canary", plannedCalls)) {
    throw new Error(`Live hallucination canary budget rejected ${plannedCalls} calls.`);
  }

  console.log(`Running live hallucination canary: cases=${selectedCases.length} repeat=${repeat} calls=${plannedCalls}`);
  const results: CanaryResult[] = [];
  for (let sampleIndex = 0; sampleIndex < repeat; sampleIndex += 1) {
    for (let caseIndex = 0; caseIndex < selectedCases.length; caseIndex += 1) {
      const testCase = selectedCases[caseIndex]!;
      const result = await runCase({ baseUrl, testCase, caseIndex, sampleIndex });
      results.push(result);
      const ignored = result.denialAwareIgnoredTerms.length > 0 ? ` safeDenials=${result.denialAwareIgnoredTerms.join("|")}` : "";
      console.log(`${result.severeError ? "FAIL" : "PASS"} ${result.id} sample=${sampleIndex + 1}${result.failures.length > 0 ? ` failures=${result.failures.join(",")}` : ""}${ignored}`);
    }
  }

  const summary = summarizeNarrativeSafetyEval(results);
  const output = {
    suite: "live-hallucination-canary",
    evidenceClass: "live_model_denial_aware_visible_only",
    baseUrl,
    selectedCaseIds: selectedIds,
    repeat,
    plannedCalls,
    summary,
    results,
    timestamp: new Date().toISOString(),
    gitSha: getGitSha(),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  appendHistory({
    suite: "live-hallucination-canary",
    mode: "live",
    total: results.length,
    pass: results.filter((result) => !result.severeError).length,
    passRate: results.length === 0 ? 0 : results.filter((result) => !result.severeError).length / results.length,
    gate: summary.gatePass ? "pass" : "fail",
    dimensions: {
      unknownEntityPassRate: summary.unknownEntityPassRate,
      npcKnowledgePassRate: summary.npcKnowledgePassRate,
      unsupportedFactPassRate: summary.unsupportedFactPassRate,
      commitSafetyPassRate: summary.commitSafetyPassRate,
    },
    timestamp: output.timestamp,
    gitSha: output.gitSha,
  });

  console.log(`Live hallucination canary gate=${summary.gatePass ? "pass" : "fail"} report=${outPath}`);
  if (!summary.gatePass) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
