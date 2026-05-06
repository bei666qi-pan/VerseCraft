/**
 * Chat turn latency + contract + quality benchmark.
 *
 * PR-safe modes use deterministic mock or degraded SSE. Live mode is opt-in and
 * should only run when gateway secrets are available.
 */
import fs from "node:fs";
import path from "node:path";
import { CHAT_LATENCY_BUDGET } from "../src/lib/perf/waitingConfig";
import { probeChatSse, type ChatSseProbeMetrics } from "../src/lib/perf/chatSseProbe";

type BenchmarkMode = "fixtures" | "mock" | "live" | "degraded";

type FixtureExpect = {
  minNarrativeChars: number;
  optionsCount?: number;
  allowOptionsMissing?: boolean;
  mustNotContain?: string[];
  mustContainAny?: string[];
};

type Fixture = {
  scenario: string;
  description?: string;
  latestUserInput: string;
  playerContext: string;
  observabilityNotes?: string;
  mockScenario?: string;
  expect: FixtureExpect;
};

type ProbeMetrics = ChatSseProbeMetrics & {
  scenario: string;
  run: number;
  narrativeNonEmpty: boolean;
  contractPass: boolean;
  qualityPass: boolean;
  budgetFailures: string[];
  qualityFailures: string[];
  optionsRepairDetected: boolean;
};

type PercentileSummary = {
  p50: number | null;
  p95: number | null;
};

type BenchmarkSummary = {
  runs: number;
  http200: number;
  finalFrames: number;
  finalJsonParse: number;
  contractPass: number;
  qualityPass: number;
  narrativeNonEmpty: number;
  optionsQualityPass: number;
  firstStatusMs: PercentileSummary;
  firstTokenMs: PercentileSummary;
  finalMs: PercentileSummary;
  statusFrames: PercentileSummary;
  longGapCount: PercentileSummary;
  budgetOk: boolean;
  budgetFailures: string[];
};

type CliOptions = {
  assertBudget: boolean;
  includeAll: boolean;
  json: boolean;
  jsonOnly: boolean;
  jsonOut: string | null;
  mode: BenchmarkMode;
  runs: number;
  scenario: string;
  warmupRuns: number;
};

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "benchmarks", "chat-turns");

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function resolveMode(args: string[]): BenchmarkMode {
  const raw = (getArgValue(args, "--mode") ?? process.env.BENCHMARK_CHAT_MODE ?? "").trim().toLowerCase();
  if (raw === "mock" || raw === "live" || raw === "degraded" || raw === "fixtures") return raw;
  if (args.includes("--degraded-smoke") || process.env.VC_BENCHMARK_DEGRADED_SMOKE === "1") return "degraded";
  if (process.env.E2E_AI_LIVE === "1") return "live";
  return "fixtures";
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const mode = resolveMode(args);
  const runsRaw = getArgValue(args, "--runs") ?? process.env.BENCHMARK_CHAT_RUNS ?? "3";
  const warmupRaw =
    getArgValue(args, "--warmup-runs") ??
    process.env.BENCHMARK_CHAT_WARMUP_RUNS ??
    (mode === "fixtures" ? "0" : "1");
  return {
    assertBudget:
      args.includes("--assert-budget") ||
      process.env.VC_ASSERT_CHAT_LATENCY_BUDGET === "1" ||
      process.env.BENCHMARK_CHAT_ENFORCE === "1",
    includeAll: args.includes("--include-all") || process.env.BENCHMARK_CHAT_INCLUDE_ALL === "1",
    json: args.includes("--json") || args.includes("--json-only") || process.env.VC_BENCHMARK_CHAT_JSON === "1",
    jsonOnly: args.includes("--json-only"),
    jsonOut: getArgValue(args, "--json-out") ?? process.env.VC_BENCHMARK_CHAT_JSON_OUT ?? null,
    mode,
    runs: Math.max(1, Math.min(100, Number(runsRaw) || 3)),
    scenario: getArgValue(args, "--scenario") ?? process.env.BENCHMARK_CHAT_SCENARIO ?? "normal_action",
    warmupRuns: Math.max(0, Math.min(5, Number(warmupRaw) || 0)),
  };
}

function log(options: CliOptions, message = ""): void {
  if (!options.jsonOnly) console.log(message);
}

function loadFixtures(): Fixture[] {
  if (!fs.existsSync(dir)) {
    console.error("Missing benchmarks/chat-turns directory");
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Fixture)
    .sort((a, b) => a.scenario.localeCompare(b.scenario));
}

function percentile(values: number[], p: number): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const idx = Math.min(clean.length - 1, Math.max(0, Math.ceil(clean.length * p) - 1));
  return clean[idx] ?? null;
}

function fmt(value: number | null): string {
  return value == null ? "n/a" : String(Math.round(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finalContains(metrics: ChatSseProbeMetrics, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const root = asRecord(metrics.finalJson);
  const narrative = typeof root?.narrative === "string" ? root.narrative : "";
  const options = Array.isArray(root?.options) ? root.options.filter((x): x is string => typeof x === "string").join("\n") : "";
  const text = `${narrative}\n${options}`;
  return terms.some((term) => text.includes(term));
}

function finalDoesNotContain(metrics: ChatSseProbeMetrics, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const root = asRecord(metrics.finalJson);
  const narrative = typeof root?.narrative === "string" ? root.narrative : "";
  const options = Array.isArray(root?.options) ? root.options.filter((x): x is string => typeof x === "string").join("\n") : "";
  const text = `${narrative}\n${options}`;
  return terms.every((term) => !text.includes(term));
}

function assessFixtureQuality(fixture: Fixture, metrics: ChatSseProbeMetrics): string[] {
  const failures: string[] = [];
  const expect = fixture.expect;
  if (!metrics.contractPass) failures.push("contract_failed");
  if (!metrics.finalJsonParseSuccess) failures.push("final_json_parse_failed");
  if (metrics.narrativeChars <= 0) failures.push("narrative_empty");
  if (metrics.narrativeChars < expect.minNarrativeChars) {
    failures.push(`narrativeChars<${expect.minNarrativeChars}`);
  }
  const expectedOptions = expect.optionsCount ?? 4;
  if (!expect.allowOptionsMissing && metrics.optionsCount !== expectedOptions) {
    failures.push(`optionsCount!=${expectedOptions}`);
  }
  if (!expect.allowOptionsMissing && !metrics.optionsQualityPass) failures.push("options_quality_failed");
  if (!finalDoesNotContain(metrics, expect.mustNotContain ?? [])) failures.push("must_not_contain_failed");
  if (!finalContains(metrics, expect.mustContainAny ?? [])) failures.push("must_contain_any_failed");
  return failures;
}

function assessBudget(mode: BenchmarkMode, metrics: ChatSseProbeMetrics): string[] {
  const failures: string[] = [];
  if (metrics.httpStatus !== 200) failures.push(`http=${metrics.httpStatus}`);
  if (!metrics.finalFrameReceived) failures.push("final_frame_missing");
  if (!metrics.finalJsonParseSuccess) failures.push("final_json_parse_failed");
  if (mode === "degraded") {
    if (metrics.aiStatus.toLowerCase() !== "keys_missing") failures.push(`aiStatus=${metrics.aiStatus || "missing"}`);
    if (metrics.firstStatusMs == null || metrics.firstStatusMs > CHAT_LATENCY_BUDGET.degradedFirstStatusMaxMs) {
      failures.push(`firstStatusMs>${CHAT_LATENCY_BUDGET.degradedFirstStatusMaxMs}`);
    }
    if (metrics.finalMs == null || metrics.finalMs > CHAT_LATENCY_BUDGET.degradedFinalFrameMaxMs) {
      failures.push(`finalMs>${CHAT_LATENCY_BUDGET.degradedFinalFrameMaxMs}`);
    }
    return failures;
  }
  if (metrics.firstStatusMs == null || metrics.firstStatusMs > CHAT_LATENCY_BUDGET.firstStatusShownP95Ms) {
    failures.push(`firstStatusMs>${CHAT_LATENCY_BUDGET.firstStatusShownP95Ms}`);
  }
  if (metrics.firstTokenMs == null || metrics.firstTokenMs > CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms) {
    failures.push(`firstTokenMs>${CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms}`);
  }
  if (metrics.finalMs == null || metrics.finalMs > CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms) {
    failures.push(`finalMs>${CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms}`);
  }
  if (metrics.longGapCount > 0) failures.push(`longGapCount=${metrics.longGapCount}`);
  return failures;
}

async function probeOne(baseUrl: string, fixture: Fixture, run: number, mode: BenchmarkMode): Promise<ProbeMetrics> {
  const requestId = `benchmark-${mode}-${fixture.scenario}-${run}-${Date.now()}`;
  const marker = mode === "mock" && fixture.mockScenario ? `[mock_scenario:${fixture.mockScenario}] ` : "";
  const content = `${marker}${fixture.latestUserInput}`;
  const metrics = await probeChatSse({
    baseUrl,
    timeoutMs: 120_000,
    headers: {
      Accept: "text/event-stream",
      "X-VerseCraft-Request-Id": requestId,
      "X-Forwarded-For": `127.0.0.${(run % 200) + 1}`,
    },
    body: {
      latestUserInput: content,
      messages: [{ role: "user", content }],
      playerContext: fixture.playerContext,
      sessionId: requestId,
    },
  });
  const budgetFailures = assessBudget(mode, metrics);
  const qualityFailures = mode === "degraded" ? [] : assessFixtureQuality(fixture, metrics);
  return {
    ...metrics,
    scenario: fixture.scenario,
    run,
    narrativeNonEmpty: metrics.narrativeChars > 0,
    contractPass: metrics.contractPass,
    qualityPass: qualityFailures.length === 0,
    budgetFailures,
    qualityFailures,
    optionsRepairDetected: JSON.stringify(metrics.finalJson ?? {}).includes("options_repair"),
  };
}

function printProbe(options: CliOptions, m: ProbeMetrics): void {
  const suffix = [...m.budgetFailures, ...m.qualityFailures, m.error ? `error=${m.error}` : ""].filter(Boolean).join(",");
  log(
    options,
    `  ${m.scenario}#${m.run}: http=${m.httpStatus} firstSseMs=${fmt(m.firstSseMs)} firstStatusMs=${fmt(
      m.firstStatusMs
    )} firstTokenMs=${fmt(m.firstTokenMs)} finalMs=${fmt(m.finalMs)} narrativeChars=${m.narrativeChars} options=${
      m.optionsCount
    } optionsQuality=${m.optionsQualityPass ? 1 : 0} final=${m.finalFrameReceived ? 1 : 0} finalJson=${
      m.finalJsonParseSuccess ? 1 : 0
    } longGaps=${m.longGapCount} bytes=${m.bytesRead}${suffix ? ` failures=${suffix}` : ""}`
  );
}

function summarize(metrics: ProbeMetrics[]): BenchmarkSummary {
  const firstStatus = metrics.flatMap((m) => (m.firstStatusMs == null ? [] : [m.firstStatusMs]));
  const firstToken = metrics.flatMap((m) => (m.firstTokenMs == null ? [] : [m.firstTokenMs]));
  const final = metrics.flatMap((m) => (m.finalMs == null ? [] : [m.finalMs]));
  const statuses = metrics.map((m) => m.statusFrameCount);
  const longGaps = metrics.map((m) => m.longGapCount);
  const failures = metrics.flatMap((m) => [...m.budgetFailures, ...m.qualityFailures].map((f) => `${m.scenario}#${m.run}:${f}`));
  return {
    runs: metrics.length,
    http200: metrics.filter((m) => m.httpStatus === 200).length,
    finalFrames: metrics.filter((m) => m.finalFrameReceived).length,
    finalJsonParse: metrics.filter((m) => m.finalJsonParseSuccess).length,
    contractPass: metrics.filter((m) => m.contractPass).length,
    qualityPass: metrics.filter((m) => m.qualityPass).length,
    narrativeNonEmpty: metrics.filter((m) => m.narrativeNonEmpty).length,
    optionsQualityPass: metrics.filter((m) => m.optionsQualityPass).length,
    firstStatusMs: { p50: percentile(firstStatus, 0.5), p95: percentile(firstStatus, 0.95) },
    firstTokenMs: { p50: percentile(firstToken, 0.5), p95: percentile(firstToken, 0.95) },
    finalMs: { p50: percentile(final, 0.5), p95: percentile(final, 0.95) },
    statusFrames: { p50: percentile(statuses, 0.5), p95: percentile(statuses, 0.95) },
    longGapCount: { p50: percentile(longGaps, 0.5), p95: percentile(longGaps, 0.95) },
    budgetOk: failures.length === 0,
    budgetFailures: failures,
  };
}

function printSummary(options: CliOptions, summary: BenchmarkSummary): void {
  log(options, "\nBenchmark summary");
  log(options, `  runs=${summary.runs} http200=${summary.http200} finalFrames=${summary.finalFrames}`);
  log(options, `  finalJsonParse=${summary.finalJsonParse} contractPass=${summary.contractPass} qualityPass=${summary.qualityPass}`);
  log(options, `  narrativeNonEmpty=${summary.narrativeNonEmpty} optionsQualityPass=${summary.optionsQualityPass}`);
  log(options, `  firstStatusMs p50=${fmt(summary.firstStatusMs.p50)} p95=${fmt(summary.firstStatusMs.p95)}`);
  log(options, `  firstTokenMs  p50=${fmt(summary.firstTokenMs.p50)} p95=${fmt(summary.firstTokenMs.p95)}`);
  log(options, `  finalMs       p50=${fmt(summary.finalMs.p50)} p95=${fmt(summary.finalMs.p95)}`);
  log(options, `  longGapCount  p50=${fmt(summary.longGapCount.p50)} p95=${fmt(summary.longGapCount.p95)}`);
  log(options, `  gate=${summary.budgetOk ? "pass" : `fail (${summary.budgetFailures.join(", ")})`}`);
}

async function writeJsonIfNeeded(options: CliOptions, result: unknown): Promise<void> {
  if (options.jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(options.jsonOut)), { recursive: true });
    fs.writeFileSync(options.jsonOut, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  }
}

async function main(): Promise<void> {
  const options = parseCli();
  const fixtures = loadFixtures();
  const fixtureSummaries = fixtures.map((f) => {
    const chars = f.latestUserInput.length + f.playerContext.length;
    return {
      scenario: f.scenario,
      description: f.description ?? "",
      chars,
      estimatedTokens: Math.ceil(chars / 4),
      minNarrativeChars: f.expect?.minNarrativeChars,
      observabilityNotes: f.observabilityNotes ?? "",
    };
  });

  log(options, `Loaded ${fixtures.length} fixtures from benchmarks/chat-turns`);
  for (const f of fixtureSummaries) {
    log(options, `${f.scenario}: ~${f.chars} chars (~${f.estimatedTokens} tok est), minNarrative=${f.minNarrativeChars}`);
  }

  const baseUrl = process.env.BENCHMARK_BASE_URL ?? "http://localhost:666";
  const selected = fixtures.find((f) => f.scenario === options.scenario) ?? fixtures[0];
  const runFixtures = options.includeAll ? fixtures : selected ? Array.from({ length: options.runs }, () => selected) : [];
  const result = {
    mode: options.mode,
    baseUrl,
    budget: CHAT_LATENCY_BUDGET,
    fixtures: fixtureSummaries,
    metrics: [] as ProbeMetrics[],
    summary: null as BenchmarkSummary | null,
  };

  if (options.mode === "fixtures") {
    log(options, "\nFixture inventory only. Use --mode mock|live|degraded to probe /api/chat.");
    await writeJsonIfNeeded(options, result);
    return;
  }
  if (runFixtures.length === 0) {
    console.error("No benchmark fixtures found.");
    process.exitCode = 1;
    return;
  }

  log(options, `\n${options.mode} probe BENCHMARK_BASE_URL=${baseUrl}`);
  for (let i = 1; i <= options.warmupRuns; i += 1) {
    const warmup = await probeOne(baseUrl, runFixtures[0], 10_000 + i, options.mode);
    log(options, `  warmup#${i}: http=${warmup.httpStatus} firstTokenMs=${fmt(warmup.firstTokenMs)} finalMs=${fmt(warmup.finalMs)}`);
  }

  for (let i = 0; i < runFixtures.length; i += 1) {
    const fixture = runFixtures[i];
    const run = options.includeAll ? i + 1 : i + 1;
    const metric = await probeOne(baseUrl, fixture, run, options.mode);
    result.metrics.push(metric);
    printProbe(options, metric);
  }

  result.summary = summarize(result.metrics);
  printSummary(options, result.summary);
  if (options.assertBudget && !result.summary.budgetOk) process.exitCode = 1;
  await writeJsonIfNeeded(options, result);
}

void main();
