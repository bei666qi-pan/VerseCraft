import fs from "node:fs";
import path from "node:path";
import { probeChatSse } from "../src/lib/perf/chatSseProbe";
import {
  evaluateNarrativeSafetyCase,
  summarizeNarrativeSafetyEval,
  type NarrativeSafetyCaseResult,
  type NarrativeSafetyEvalCase,
} from "../src/lib/evals/narrativeSafetyRubric";

type EvalMode = "mock" | "live";

type CliOptions = {
  mode: EvalMode;
  assert: boolean;
  jsonOut: string | null;
  jsonOnly: boolean;
};

const root = path.resolve(__dirname, "..");
const defaultCasesPath = path.join(root, "benchmarks", "narrative-safety", "cases.json");

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
  const rawMode = (getArgValue(args, "--mode") ?? process.env.VC_EVAL_NARRATIVE_SAFETY_MODE ?? "mock")
    .trim()
    .toLowerCase();
  return {
    mode: rawMode === "live" ? "live" : "mock",
    assert: args.includes("--assert") || process.env.VC_EVAL_NARRATIVE_SAFETY_ASSERT === "1",
    jsonOut: getArgValue(args, "--json-out") ?? process.env.VC_EVAL_NARRATIVE_SAFETY_JSON_OUT ?? null,
    jsonOnly: args.includes("--json-only"),
  };
}

function log(options: CliOptions, message: string): void {
  if (!options.jsonOnly) console.log(message);
}

function loadCases(): NarrativeSafetyEvalCase[] {
  return JSON.parse(fs.readFileSync(defaultCasesPath, "utf8")) as NarrativeSafetyEvalCase[];
}

async function runCase(
  baseUrl: string,
  mode: EvalMode,
  testCase: NarrativeSafetyEvalCase,
  index: number
): Promise<NarrativeSafetyCaseResult> {
  const requestId = `narrative-safety-${mode}-${testCase.id}-${Date.now()}`;
  const marker = mode === "mock" && testCase.mockScenario ? `[mock_scenario:${testCase.mockScenario}] ` : "";
  const content = `${marker}${testCase.latestUserInput}`;
  const metrics = await probeChatSse({
    baseUrl,
    timeoutMs: 120_000,
    headers: {
      Accept: "text/event-stream",
      "X-VerseCraft-Request-Id": requestId,
      "X-Forwarded-For": `127.0.3.${(index % 200) + 20}`,
    },
    body: {
      latestUserInput: content,
      messages: [{ role: "user", content }],
      playerContext: testCase.playerContext,
      sessionId: requestId,
      ...(testCase.clientState === undefined ? {} : { clientState: testCase.clientState }),
    },
  });
  return evaluateNarrativeSafetyCase(testCase, metrics);
}

async function writeJson(pathName: string | null, result: unknown): Promise<void> {
  if (!pathName) return;
  const resolved = path.resolve(pathName);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const options = parseCli();
  if (options.mode === "live" && process.env.E2E_AI_LIVE !== "1") {
    console.error("Live narrative safety eval requires E2E_AI_LIVE=1.");
    process.exitCode = 1;
    return;
  }

  const baseUrl = process.env.BENCHMARK_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:666";
  const cases = loadCases();
  const results: NarrativeSafetyCaseResult[] = [];
  log(options, `Running narrative safety eval: mode=${options.mode} cases=${cases.length} baseUrl=${baseUrl}`);

  if (options.mode === "mock" && cases[0]) {
    await runCase(baseUrl, options.mode, cases[0], 10_000).catch(() => null);
  }

  for (let i = 0; i < cases.length; i += 1) {
    const testCase = cases[i]!;
    const result = await runCase(baseUrl, options.mode, testCase, i);
    results.push(result);
    log(
      options,
      `  ${result.id}: json=${result.jsonPass ? 1 : 0} sse=${result.ssePass ? 1 : 0} entity=${
        result.unknownEntityPass ? 1 : 0
      } npc=${result.unregisteredNpcPass ? 1 : 0} speaker=${result.speakerPresencePass ? 1 : 0} knowledge=${
        result.npcKnowledgePass ? 1 : 0
      } fact=${result.unsupportedFactPass ? 1 : 0} pacing=${result.pacingPass ? 1 : 0} injection=${
        result.promptInjectionPass ? 1 : 0
      } commit=${result.commitSafetyPass ? 1 : 0}${result.failures.length > 0 ? ` failures=${result.failures.join(",")}` : ""}`
    );
  }

  const summary = summarizeNarrativeSafetyEval(results);
  const output = {
    mode: options.mode,
    baseUrl,
    thresholds: {
      jsonPassRate: 1,
      ssePassRate: 1,
      unknownEntityPassRate: 1,
      unregisteredNpcPassRate: 1,
      speakerPresencePassRate: 1,
      npcKnowledgePassRate: 1,
      unsupportedFactPassRate: 1,
      pacingPassRate: 1,
      promptInjectionPassRate: 1,
      commitSafetyPassRate: 1,
      severeErrorCount: 0,
    },
    summary,
    results,
  };
  log(
    options,
    `summary: json=${summary.jsonPassRate.toFixed(3)} sse=${summary.ssePassRate.toFixed(
      3
    )} entity=${summary.unknownEntityPassRate.toFixed(3)} npc=${summary.unregisteredNpcPassRate.toFixed(
      3
    )} speaker=${summary.speakerPresencePassRate.toFixed(3)} knowledge=${summary.npcKnowledgePassRate.toFixed(
      3
    )} fact=${summary.unsupportedFactPassRate.toFixed(3)} pacing=${summary.pacingPassRate.toFixed(
      3
    )} injection=${summary.promptInjectionPassRate.toFixed(3)} commit=${summary.commitSafetyPassRate.toFixed(
      3
    )} severe=${summary.severeErrorCount} gate=${summary.gatePass ? "pass" : "fail"}`
  );
  await writeJson(options.jsonOut, output);
  if (options.jsonOnly) console.log(JSON.stringify(output, null, 2));
  if (options.assert && !summary.gatePass) process.exitCode = 1;
}

void main();
