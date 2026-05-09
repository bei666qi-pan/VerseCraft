import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { probeChatSse } from "../src/lib/perf/chatSseProbe";
import {
  evaluateChatQualityCase,
  summarizeChatQualityEval,
  type ChatEvalCase,
  type ChatEvalCaseResult,
} from "../src/lib/evals/chatQualityRubric";
import {
  LIVE_GATE_CASE_TIMEOUT_MS,
  LIVE_GATE_MAX_CASES,
  LIVE_GATE_MAX_RETRIES,
  LIVE_GATE_TOTAL_BUDGET_MS,
  classifyLiveGateFailure,
  isLiveGateCacheHit,
  resolveLiveGateBypass,
  shouldExitNonZero,
  type LiveGateCacheEntry,
  type MainAiLiveGateStatus,
} from "../src/lib/ci/mainAiLiveGate";

type GateReport = {
  status: MainAiLiveGateStatus;
  reason: string;
  strict: boolean;
  cached: boolean;
  cacheKey: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  budgetMs: number;
  caseTimeoutMs: number;
  maxCases: number;
  maxRetries: number;
  summary: ReturnType<typeof summarizeChatQualityEval> | null;
  results: ChatEvalCaseResult[];
  errors: string[];
};

const root = path.resolve(__dirname, "..");
const runtimeDir = path.join(root, ".runtime-data");
const reportPath = path.join(runtimeDir, "main-ai-live-gate.json");
const cachePath = path.join(runtimeDir, "main-ai-live-gate-cache.json");
const casesPath = path.join(root, "benchmarks", "llm-evals", "cases.json");
const strict = process.argv.includes("--strict");
const noCache = process.argv.includes("--no-cache");
const baseUrl = process.env.BENCHMARK_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:666";

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readIfExists(filePath: string): Buffer {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.from("");
}

function gitHead(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown-head";
  }
}

function buildCacheKey(): string {
  const files = [
    "src/app/api/chat/route.ts",
    "src/lib/playRealtime/playerChatSystemPrompt.ts",
    "src/lib/ai/logicalTasks.ts",
    "src/lib/ai/tasks/taskPolicy.ts",
    "src/lib/perf/chatSseProbe.ts",
    "src/lib/evals/chatQualityRubric.ts",
    "benchmarks/llm-evals/cases.json",
  ];
  const hash = crypto.createHash("sha256");
  hash.update(gitHead());
  for (const file of files) {
    hash.update(file);
    hash.update(readIfExists(path.join(root, file)));
  }
  return hash.digest("hex");
}

function readCache(): LiveGateCacheEntry | null {
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8")) as LiveGateCacheEntry;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadCases(): ChatEvalCase[] {
  const all = JSON.parse(fs.readFileSync(casesPath, "utf8")) as ChatEvalCase[];
  return all.slice(0, LIVE_GATE_MAX_CASES);
}

async function runCase(testCase: ChatEvalCase, index: number, deadlineAt: number): Promise<ChatEvalCaseResult> {
  let lastResult: ChatEvalCaseResult | null = null;
  const attempts = LIVE_GATE_MAX_RETRIES + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 1000) {
      throw new Error("budget_exceeded");
    }
    const timeoutMs = Math.min(LIVE_GATE_CASE_TIMEOUT_MS, remaining);
    const requestId = `main-live-${testCase.id}-${Date.now()}-${attempt}`;
    const metrics = await probeChatSse({
      baseUrl,
      timeoutMs,
      headers: {
        Accept: "text/event-stream",
        "X-VerseCraft-Request-Id": requestId,
        "X-Forwarded-For": `127.0.3.${(index % 200) + 20}`,
      },
      body: {
        latestUserInput: testCase.latestUserInput,
        messages: [{ role: "user", content: testCase.latestUserInput }],
        playerContext: testCase.playerContext,
        sessionId: requestId,
      },
    });
    lastResult = evaluateChatQualityCase(testCase, metrics);
    if (!lastResult.severeError && lastResult.jsonPass) return lastResult;
  }
  return lastResult!;
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const cacheKey = buildCacheKey();
  const errors: string[] = [];
  let status: MainAiLiveGateStatus = "soft_failed";
  let reason = "not_started";
  let cached = false;
  const results: ChatEvalCaseResult[] = [];
  let summary: ReturnType<typeof summarizeChatQualityEval> | null = null;

  const bypass = resolveLiveGateBypass(process.env);
  if (bypass.kind === "skipped") {
    status = "skipped";
    reason = `bypassed:${sha256(bypass.reason).slice(0, 12)}`;
  } else if (bypass.kind === "invalid") {
    status = "soft_failed";
    reason = bypass.reason;
  } else if (process.env.E2E_AI_LIVE !== "1") {
    const classified = classifyLiveGateFailure({ missingLiveEnable: true });
    status = classified.status;
    reason = classified.reason;
  } else if (!noCache && isLiveGateCacheHit(readCache(), cacheKey, Date.now())) {
    status = "pass";
    reason = "cache_hit_24h";
    cached = true;
  } else {
    const deadlineAt = Date.now() + LIVE_GATE_TOTAL_BUDGET_MS;
    try {
      const cases = loadCases();
      for (let i = 0; i < cases.length; i += 1) {
        results.push(await runCase(cases[i]!, i, deadlineAt));
      }
      summary = summarizeChatQualityEval(results);
      const classified = classifyLiveGateFailure({
        gatePass: summary.gatePass,
        errors: results.flatMap((result) => result.failures),
      });
      status = classified.status;
      reason = classified.reason;
      if (status === "pass") {
        writeJson(cachePath, { cacheKey, status, createdAt: new Date().toISOString() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      const classified = classifyLiveGateFailure({
        budgetExceeded: message.includes("budget_exceeded"),
        missingServer: /ECONNREFUSED|fetch failed|Failed to fetch/i.test(message),
        errors,
      });
      status = classified.status;
      reason = classified.reason;
    }
  }

  const report: GateReport = {
    status,
    reason,
    strict,
    cached,
    cacheKey,
    baseUrl,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    budgetMs: LIVE_GATE_TOTAL_BUDGET_MS,
    caseTimeoutMs: LIVE_GATE_CASE_TIMEOUT_MS,
    maxCases: LIVE_GATE_MAX_CASES,
    maxRetries: LIVE_GATE_MAX_RETRIES,
    summary,
    results,
    errors,
  };
  writeJson(reportPath, report);
  console.log(`[main-ai-live-gate] status=${status} reason=${reason} cached=${cached} report=${path.relative(root, reportPath)}`);
  if (shouldExitNonZero(status, strict)) process.exitCode = 1;
}

void main();
