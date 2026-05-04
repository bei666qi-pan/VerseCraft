/**
 * Chat turn latency benchmark and budget gate.
 *
 * Default mode prints fixture sizes only, so CI without AI keys never fails by
 * accident. Live assertions require E2E_AI_LIVE=1 plus --assert-budget or
 * VC_ASSERT_CHAT_LATENCY_BUDGET=1.
 */
import fs from "node:fs";
import path from "node:path";
import { CHAT_LATENCY_BUDGET } from "../src/lib/perf/waitingConfig";

type Fixture = {
  scenario: string;
  description?: string;
  latestUserInput: string;
  playerContext: string;
  observabilityNotes?: string;
};

type ProbeMetrics = {
  scenario: string;
  run: number;
  httpStatus: number;
  contentType: string;
  aiStatus: string;
  firstSseMs: number | null;
  firstStatusMs: number | null;
  firstTokenMs: number | null;
  finalMs: number | null;
  statusFrames: number;
  finalFrameReceived: boolean;
  finalJsonParseSuccess: boolean;
  maxInterChunkGapMs: number;
  longGapCount: number;
  bytesRead: number;
  error?: string;
};

type PercentileSummary = {
  p50: number | null;
  p95: number | null;
};

type LiveSummary = {
  runs: number;
  http200: number;
  finalFrames: number;
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
  degradedSmoke: boolean;
  includeAll: boolean;
  json: boolean;
  jsonOnly: boolean;
  jsonOut: string | null;
  runs: number;
  scenario: string;
  warmupRuns: number;
};

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "benchmarks", "chat-turns");
const CONTROL_PREFIX = "__VERSECRAFT_";
const STATUS_PREFIX = "__VERSECRAFT_STATUS__:";
const FINAL_PREFIX = "__VERSECRAFT_FINAL__:";

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
  const runsRaw = getArgValue(args, "--runs") ?? process.env.BENCHMARK_CHAT_RUNS ?? "10";
  const warmupRaw = getArgValue(args, "--warmup-runs") ?? process.env.BENCHMARK_CHAT_WARMUP_RUNS ?? "1";
  return {
    assertBudget:
      args.includes("--assert-budget") ||
      process.env.VC_ASSERT_CHAT_LATENCY_BUDGET === "1" ||
      process.env.BENCHMARK_CHAT_ENFORCE === "1",
    degradedSmoke: args.includes("--degraded-smoke") || process.env.VC_BENCHMARK_DEGRADED_SMOKE === "1",
    includeAll: args.includes("--include-all") || process.env.BENCHMARK_CHAT_INCLUDE_ALL === "1",
    json: args.includes("--json") || args.includes("--json-only") || process.env.VC_BENCHMARK_CHAT_JSON === "1",
    jsonOnly: args.includes("--json-only"),
    jsonOut: getArgValue(args, "--json-out") ?? process.env.VC_BENCHMARK_CHAT_JSON_OUT ?? null,
    runs: Math.max(1, Math.min(100, Number(runsRaw) || 10)),
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
  const out: Fixture[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Fixture;
    out.push(j);
  }
  return out.sort((a, b) => a.scenario.localeCompare(b.scenario));
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

function extractDataPayload(eventText: string): string {
  return eventText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

function isContractJson(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Boolean(
      parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof parsed.narrative === "string" &&
        typeof parsed.is_action_legal === "boolean"
    );
  } catch {
    return false;
  }
}

async function probeOne(baseUrl: string, fixture: Fixture, run: number): Promise<ProbeMetrics> {
  const requestId = `benchmark-${fixture.scenario}-${run}-${Date.now()}`;
  const body = {
    messages: [{ role: "user" as const, content: fixture.latestUserInput }],
    playerContext: fixture.playerContext,
    sessionId: `benchmark-${fixture.scenario}-${run}-${Date.now()}`,
  };

  const t0 = Date.now();
  let firstSseMs: number | null = null;
  let firstStatusMs: number | null = null;
  let firstTokenMs: number | null = null;
  let finalMs: number | null = null;
  let statusFrames = 0;
  let finalFrameReceived = false;
  let finalJsonParseSuccess = false;
  let bytesRead = 0;
  let httpStatus = 0;
  let contentType = "";
  let aiStatus = "";
  let lastVisibleChunkAt: number | null = null;
  let maxInterChunkGapMs = 0;
  let longGapCount = 0;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-VerseCraft-Request-Id": requestId,
        "X-Forwarded-For": `127.0.0.${(run % 200) + 1}`,
      },
      body: JSON.stringify(body),
    });
    httpStatus = res.status;
    contentType = res.headers.get("content-type") ?? "";
    aiStatus = res.headers.get("x-versecraft-ai-status") ?? "";
    const reader = res.body?.getReader();
    if (!reader) {
      return {
        scenario: fixture.scenario,
        run,
        httpStatus,
        contentType,
        aiStatus,
        firstSseMs,
        firstStatusMs,
        firstTokenMs,
        finalMs,
        statusFrames,
        finalFrameReceived,
        finalJsonParseSuccess,
        maxInterChunkGapMs,
        longGapCount,
        bytesRead,
        error: "no_body_reader",
      };
    }

    const dec = new TextDecoder();
    let pending = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        pending += dec.decode(value, { stream: true });
        pending = pending.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        let eventEnd = pending.indexOf("\n\n");
        while (eventEnd >= 0) {
          const eventText = pending.slice(0, eventEnd);
          pending = pending.slice(eventEnd + 2);
          const payload = extractDataPayload(eventText);
          if (payload.length > 0) {
            const now = Date.now();
            if (firstSseMs == null) firstSseMs = now - t0;
            if (payload.startsWith(STATUS_PREFIX)) {
              statusFrames += 1;
              if (firstStatusMs == null) firstStatusMs = now - t0;
            } else if (payload.startsWith(FINAL_PREFIX)) {
              finalFrameReceived = true;
              finalJsonParseSuccess = isContractJson(payload.slice(FINAL_PREFIX.length));
              if (finalMs == null) finalMs = now - t0;
            } else if (!payload.startsWith(CONTROL_PREFIX)) {
              if (firstTokenMs == null) firstTokenMs = now - t0;
              if (lastVisibleChunkAt != null) {
                const gap = now - lastVisibleChunkAt;
                maxInterChunkGapMs = Math.max(maxInterChunkGapMs, gap);
                if (gap >= CHAT_LATENCY_BUDGET.maxInterChunkGapWarnMs) longGapCount += 1;
              }
              lastVisibleChunkAt = now;
            }
          }
          eventEnd = pending.indexOf("\n\n");
        }

        if (Date.now() - t0 > 120_000) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    return {
      scenario: fixture.scenario,
      run,
      httpStatus,
      contentType,
      aiStatus,
      firstSseMs,
      firstStatusMs,
      firstTokenMs,
      finalMs,
      statusFrames,
      finalFrameReceived,
      finalJsonParseSuccess,
      maxInterChunkGapMs,
      longGapCount,
      bytesRead,
    };
  } catch (e) {
    return {
      scenario: fixture.scenario,
      run,
      httpStatus,
      contentType,
      aiStatus,
      firstSseMs,
      firstStatusMs,
      firstTokenMs,
      finalMs,
      statusFrames,
      finalFrameReceived,
      finalJsonParseSuccess,
      maxInterChunkGapMs,
      longGapCount,
      bytesRead,
      error: (e as Error).message,
    };
  }
}

function printProbe(options: CliOptions, m: ProbeMetrics): void {
  const suffix = m.error ? ` error=${m.error}` : "";
  log(
    options,
    `  ${m.scenario}#${m.run}: http=${m.httpStatus} firstSseMs=${fmt(m.firstSseMs)} firstStatusMs=${fmt(
      m.firstStatusMs
    )} firstTokenMs=${fmt(m.firstTokenMs)} finalMs=${fmt(m.finalMs)} statusFrames=${m.statusFrames} final=${
      m.finalFrameReceived ? 1 : 0
    } finalJson=${m.finalJsonParseSuccess ? 1 : 0} longGaps=${m.longGapCount} bytes=${m.bytesRead}${suffix}`
  );
}

function summarize(metrics: ProbeMetrics[]): LiveSummary {
  const ok = metrics.filter((m) => !m.error && m.httpStatus === 200);
  const firstStatus = ok.flatMap((m) => (m.firstStatusMs == null ? [] : [m.firstStatusMs]));
  const firstToken = ok.flatMap((m) => (m.firstTokenMs == null ? [] : [m.firstTokenMs]));
  const final = ok.flatMap((m) => (m.finalMs == null ? [] : [m.finalMs]));
  const statuses = ok.map((m) => m.statusFrames);
  const longGaps = ok.map((m) => m.longGapCount);
  const summary: LiveSummary = {
    runs: metrics.length,
    http200: ok.length,
    finalFrames: ok.filter((m) => m.finalFrameReceived).length,
    firstStatusMs: { p50: percentile(firstStatus, 0.5), p95: percentile(firstStatus, 0.95) },
    firstTokenMs: { p50: percentile(firstToken, 0.5), p95: percentile(firstToken, 0.95) },
    finalMs: { p50: percentile(final, 0.5), p95: percentile(final, 0.95) },
    statusFrames: { p50: percentile(statuses, 0.5), p95: percentile(statuses, 0.95) },
    longGapCount: { p50: percentile(longGaps, 0.5), p95: percentile(longGaps, 0.95) },
    budgetOk: true,
    budgetFailures: [],
  };

  const failures = summary.budgetFailures;
  if (summary.http200 !== summary.runs) failures.push(`http200 ${summary.http200}/${summary.runs}`);
  if (summary.finalFrames !== summary.runs) failures.push(`finalFrames ${summary.finalFrames}/${summary.runs}`);
  if (summary.firstStatusMs.p95 == null || summary.firstStatusMs.p95 > CHAT_LATENCY_BUDGET.firstStatusShownP95Ms) {
    failures.push(`firstStatusMs.p95>${CHAT_LATENCY_BUDGET.firstStatusShownP95Ms}`);
  }
  if (summary.firstTokenMs.p50 == null || summary.firstTokenMs.p50 > CHAT_LATENCY_BUDGET.firstVisibleTextP50Ms) {
    failures.push(`firstTokenMs.p50>${CHAT_LATENCY_BUDGET.firstVisibleTextP50Ms}`);
  }
  if (summary.firstTokenMs.p95 == null || summary.firstTokenMs.p95 > CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms) {
    failures.push(`firstTokenMs.p95>${CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms}`);
  }
  if (summary.finalMs.p50 == null || summary.finalMs.p50 > CHAT_LATENCY_BUDGET.normalTurnFinalP50Ms) {
    failures.push(`finalMs.p50>${CHAT_LATENCY_BUDGET.normalTurnFinalP50Ms}`);
  }
  if (summary.finalMs.p95 == null || summary.finalMs.p95 > CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms) {
    failures.push(`finalMs.p95>${CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms}`);
  }
  if (summary.statusFrames.p50 == null || summary.statusFrames.p50 < CHAT_LATENCY_BUDGET.minStatusFramesPerTurn) {
    failures.push(`statusFrames.p50<${CHAT_LATENCY_BUDGET.minStatusFramesPerTurn}`);
  }
  summary.budgetOk = failures.length === 0;
  return summary;
}

function printSummary(options: CliOptions, summary: LiveSummary): void {
  log(options, "\nLive summary");
  log(options, `  runs=${summary.runs} http200=${summary.http200} finalFrames=${summary.finalFrames}`);
  log(options, `  firstStatusMs p50=${fmt(summary.firstStatusMs.p50)} p95=${fmt(summary.firstStatusMs.p95)}`);
  log(options, `  firstTokenMs  p50=${fmt(summary.firstTokenMs.p50)} p95=${fmt(summary.firstTokenMs.p95)}`);
  log(options, `  finalMs       p50=${fmt(summary.finalMs.p50)} p95=${fmt(summary.finalMs.p95)}`);
  log(options, `  statusFrames  p50=${fmt(summary.statusFrames.p50)} p95=${fmt(summary.statusFrames.p95)}`);
  log(options, `  longGapCount  p50=${fmt(summary.longGapCount.p50)} p95=${fmt(summary.longGapCount.p95)}`);
  log(options, `  budget=${summary.budgetOk ? "pass" : `fail (${summary.budgetFailures.join(", ")})`}`);
}

function assertDegradedSmoke(m: ProbeMetrics): string[] {
  const failures: string[] = [];
  if (m.httpStatus !== 200) failures.push(`http=${m.httpStatus}`);
  if (!m.contentType.toLowerCase().includes("text/event-stream")) failures.push("content-type is not event-stream");
  if (m.aiStatus.toLowerCase() !== "keys_missing") failures.push(`aiStatus=${m.aiStatus || "missing"}`);
  if (m.firstStatusMs == null || m.firstStatusMs > CHAT_LATENCY_BUDGET.degradedFirstStatusMaxMs) {
    failures.push(`firstStatusMs>${CHAT_LATENCY_BUDGET.degradedFirstStatusMaxMs}`);
  }
  if (m.finalMs == null || m.finalMs > CHAT_LATENCY_BUDGET.degradedFinalFrameMaxMs) {
    failures.push(`finalMs>${CHAT_LATENCY_BUDGET.degradedFinalFrameMaxMs}`);
  }
  if (!m.finalFrameReceived) failures.push("final frame missing");
  if (!m.finalJsonParseSuccess) failures.push("final JSON parse failed");
  return failures;
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
      observabilityNotes: f.observabilityNotes ?? "",
    };
  });

  log(options, `Loaded ${fixtures.length} fixtures from benchmarks/chat-turns\n`);
  for (const f of fixtureSummaries) {
    log(options, `${f.scenario}: ~${f.chars} chars (~${f.estimatedTokens} tok est) - ${f.description}`);
    if (f.observabilityNotes) log(options, `  notes: ${f.observabilityNotes}`);
  }

  const live = process.env.E2E_AI_LIVE === "1";
  const baseUrl = process.env.BENCHMARK_BASE_URL ?? "http://localhost:666";
  const fixture = fixtures.find((f) => f.scenario === options.scenario) ?? fixtures[0];
  const result: {
    mode: "fixtures" | "degraded-smoke" | "live";
    baseUrl: string;
    budget: typeof CHAT_LATENCY_BUDGET;
    fixtures: typeof fixtureSummaries;
    metrics: ProbeMetrics[];
    summary: LiveSummary | null;
    degradedFailures: string[];
  } = {
    mode: live ? "live" : options.degradedSmoke ? "degraded-smoke" : "fixtures",
    baseUrl,
    budget: CHAT_LATENCY_BUDGET,
    fixtures: fixtureSummaries,
    metrics: [],
    summary: null,
    degradedFailures: [],
  };

  if (!fixture) {
    console.error("No benchmark fixtures found.");
    process.exitCode = 1;
    return;
  }

  if (!live) {
    if (!options.degradedSmoke) {
      log(options, "\nSet E2E_AI_LIVE=1 to probe live TTFT. Use VC_BENCHMARK_DEGRADED_SMOKE=1 for no-key SSE smoke.");
      await writeJsonIfNeeded(options, result);
      return;
    }
    log(options, `\nDegraded smoke BENCHMARK_BASE_URL=${baseUrl}`);
    const metric = await probeOne(baseUrl, fixture, 1);
    result.metrics.push(metric);
    printProbe(options, metric);
    result.degradedFailures = assertDegradedSmoke(metric);
    log(options, `  degraded=${result.degradedFailures.length === 0 ? "pass" : `fail (${result.degradedFailures.join(", ")})`}`);
    if (options.assertBudget && result.degradedFailures.length > 0) process.exitCode = 1;
    await writeJsonIfNeeded(options, result);
    return;
  }

  log(options, `\nLive probe BENCHMARK_BASE_URL=${baseUrl}`);
  log(options, `Live ordinary scenario=${fixture.scenario} runs=${options.runs}\n`);

  for (let i = 1; i <= options.warmupRuns; i += 1) {
    const warmup = await probeOne(baseUrl, fixture, 10_000 + i);
    log(
      options,
      `  warmup#${i}: http=${warmup.httpStatus} firstStatusMs=${fmt(warmup.firstStatusMs)} firstTokenMs=${fmt(
        warmup.firstTokenMs
      )} finalMs=${fmt(warmup.finalMs)}`
    );
  }
  if (options.warmupRuns > 0) log(options);

  for (let i = 1; i <= options.runs; i += 1) {
    const m = await probeOne(baseUrl, fixture, i);
    result.metrics.push(m);
    printProbe(options, m);
  }

  if (options.includeAll) {
    log(options, "\nLive fixture sweep");
    let run = 1;
    for (const f of fixtures) {
      const m = await probeOne(baseUrl, f, run);
      printProbe(options, m);
      run += 1;
    }
  }

  result.summary = summarize(result.metrics);
  printSummary(options, result.summary);
  if (options.assertBudget && !result.summary.budgetOk) process.exitCode = 1;
  await writeJsonIfNeeded(options, result);
}

void main();
