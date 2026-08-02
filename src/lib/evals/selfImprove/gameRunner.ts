/**
 * Self-Improving Agent System — Game Runner
 *
 * Executes game turns against scenarios, either via:
 * - Mock mode: uses the existing mock provider infrastructure
 * - Live mode: uses HttpSutAdapter to call /api/chat via HTTP
 *
 * Produces standardized SelfImproveTrace for each execution.
 */

import type { SelfImproveScenario, SelfImproveTrace } from "./types";
import { getState } from "./stateMachine";
import { canAffordLiveCall, consumeLiveCall } from "./budget";
import { isMockMode } from "./config";
import { classifyTraceErrors } from "./errorClassification";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// ── Live timing observability ─────────────────────────

export type TimeoutLayer =
  | "supervisor_command"
  | "game_runner"
  | "http_client"
  | "api_route"
  | "control_preflight"
  | "ai_router"
  | "provider_gateway"
  | "unknown";

export interface LiveTimingRecord {
  requestId: string;
  caseId: string;
  startedAt: string;
  serverAcceptedMs: number | null;
  preflightStartMs: number | null;
  preflightEndMs: number | null;
  mainModelStartMs: number | null;
  firstStatusMs: number | null;
  firstTokenMs: number | null;
  finalFrameMs: number | null;
  endedAtMs: number;
  timeoutLayer: TimeoutLayer | null;
  abortSource: string | null;
  provider: string;
  model: string;
  routingAttempts: unknown[];
  httpStatus: number;
  sseFinalReceived: boolean;
  parseSuccess: boolean;
}

function appendLiveTiming(runId: string, record: LiveTimingRecord): void {
  try {
    const dir = resolve(process.cwd(), `.runtime-data/self-improve/${runId}`);
    mkdirSync(dir, { recursive: true });
    appendFileSync(resolve(dir, "live-timing.jsonl"), JSON.stringify(record) + "\n", "utf-8");
  } catch { /* observability must never break eval */ }
}

/** Offline eval wall-clock budget per live turn (separate from online UX budgets). */
function liveTurnTimeoutMs(): number {
  const raw = parseInt(process.env.SI_LIVEPLAY_TIMEOUT_MS || "", 10);
  if (Number.isFinite(raw) && raw >= 5_000 && raw <= 600_000) return raw;
  return 120_000; // hard cap retained; configurable only within bounds
}

// ── Mock execution ────────────────────────────────────

async function executeMockTurn(
  scenario: SelfImproveScenario,
  runId: string,
  round: number,
): Promise<SelfImproveTrace> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const isLegalAction = scenario.expectedInvariants.some(
    (inv) => inv.check === "action_legality" && inv.expected === "pass",
  ) || scenario.expectedInvariants.every((inv) => inv.expected === "pass");

  const mockDmJson: Record<string, unknown> = {
    is_action_legal: isLegalAction,
    sanity_damage: 0,
    narrative: `[Mock] 你${scenario.playerInput ? "尝试了：" + scenario.playerInput : "做了某事"}。这是一个模拟回合。`,
    is_death: false,
    consumes_time: true,
    options: ["继续探索", "查看背包", "与附近的人交谈", "离开这里"],
    currency_change: 0,
    new_tasks: [],
    task_updates: [],
    codex_updates: [],
    relationship_updates: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    player_location: "公寓走廊",
    npc_location_updates: [],
    bgm_track: null,
  };

  // For negative tests, mark action illegal
  // Specific scenario handling:
  const isForgeFail = scenario.tags.includes("forge") && scenario.expectedInvariants.some(
    (inv) => inv.check === "forge_transaction" && inv.expected === "fail"
  );
  const isTaskFail = scenario.tags.includes("task") && scenario.expectedInvariants.some(
    (inv) => inv.check === "task_lifecycle" && inv.expected === "fail"
  );
  const isProfessionFail = scenario.tags.includes("profession") && scenario.expectedInvariants.some(
    (inv) => inv.check === "profession_boundary" && inv.expected === "fail"
  );

  if (!isLegalAction || isForgeFail || isTaskFail || isProfessionFail) {
    mockDmJson.is_action_legal = false;
    if (isForgeFail) {
      mockDmJson.narrative = `[Mock] 材料不足，无法锻造。所需材料不满足，锻造失败。`;
      mockDmJson.awarded_items = [];
      mockDmJson.currency_change = 0;
    } else if (isTaskFail) {
      mockDmJson.narrative = `[Mock] 你尚未接取该任务，无法完成。`;
      mockDmJson.new_tasks = [];
      mockDmJson.task_updates = [];
    } else if (isProfessionFail) {
      mockDmJson.narrative = `[Mock] 你的职业无法使用该技能。`;
    } else {
      mockDmJson.narrative = `[Mock] ${scenario.playerInput || "该行动"}无法执行。`;
    }
    mockDmJson.options = ["尝试其他方式", "查看周围环境", "放弃这个行动"];
  }

  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  return {
    traceId: `trace-${runId}-${scenario.caseId}-${round}`,
    runId,
    round,
    caseId: scenario.caseId,
    seed: scenario.seed,
    model: "mock",
    provider: "mock",
    startedAt,
    endedAt,
    durationMs,
    preState: { mock: true, scenarioId: scenario.caseId },
    playerInput: scenario.playerInput,
    injectedFacts: [],
    rawModelOutput: JSON.stringify(mockDmJson),
    parsedDmJson: mockDmJson,
    normalizedDmJson: mockDmJson,
    validatorOutput: { passed: isLegalAction },
    proposedStateDelta: {},
    finalStateDelta: {},
    finalState: {},
    narrative: mockDmJson.narrative as string,
    options: mockDmJson.options as string[],
    errors: [],
    recoveryInfo: null,
    tokenUsage: { prompt: 100, completion: 50, total: 150 },
    latencyMs: durationMs,
  };
}

// ── Live execution (via HttpSutAdapter) ───────────────

async function executeLiveTurn(
  scenario: SelfImproveScenario,
  runId: string,
  round: number,
): Promise<SelfImproveTrace> {
  if (!canAffordLiveCall()) {
    throw new Error("Live model call budget exhausted.");
  }
  consumeLiveCall();

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const baseUrl = (process.env.LIVEPLAY_BASE_URL || "http://localhost:666").replace(/\/$/, "");
  const sessionId = `si-${runId}-${scenario.caseId}-${round}-${Date.now()}`;
  const requestId = `req-${scenario.caseId}-${round}-${startMs}`;

  const errors: string[] = [];
  let narrative = "";
  let dmJson: Record<string, unknown> | null = null;
  let options: string[] = [];
  const tokenUsage: { prompt: number; completion: number; total: number } | null = null;

  // ── timing observability state ──
  let serverAcceptedMs: number | null = null;
  let firstStatusMs: number | null = null;
  let firstTokenMs: number | null = null;
  let finalFrameMs: number | null = null;
  let httpStatus = 0;
  let sseFinalReceived = false;
  let parseSuccess = false;
  let timeoutLayer: TimeoutLayer | null = null;
  let abortSource: string | null = null;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        // Every eval turn is a DISTINCT logical request, never a duplicate
        // submission. Without an explicit fingerprint the server falls back to
        // anon:sha256(ip|ua), identical for all harness requests, which makes
        // the chat queue reuse a previous turn's non-terminal ticket and wedge
        // every later turn behind it (observed: turns 8+ all 120s-timeout).
        "x-versecraft-client-fingerprint": `si-eval-${requestId}`,
      },
      body: JSON.stringify({
        sessionId,
        latestUserInput: scenario.playerInput ?? "环顾四周",
        messages: [{ role: "user", content: scenario.playerInput ?? "环顾四周" }],
        clientState: {
          // Provide minimal context for NPC scenarios so the DM model
          // can verify NPC presence for dialogue actions.
          playerLocation: "公寓一楼走廊",
          nearbyNpcs: scenario.tags.includes("npc") || scenario.tags.includes("dialogue")
            ? ["林晚枫", "陈婆婆", "管理员"]
            : [],
        },
      }),
      signal: AbortSignal.timeout(liveTurnTimeoutMs()),
    });

    httpStatus = res.status;
    serverAcceptedMs = Date.now() - startMs;

    if (!res.ok) {
      errors.push(`HTTP ${res.status}: ${res.statusText}`);
      const errorText = await res.text().catch(() => "");
      errors.push(`Response body: ${errorText.slice(0, 200)}`);
    }

    // Parse SSE stream
    const reader = res.body?.getReader();
    if (!reader) {
      errors.push("No response body reader available.");
    } else {
      const decoder = new TextDecoder();
      let buffer = "";
      let finalJsonStr = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data.startsWith("__VERSECRAFT_FINAL__:")) {
              finalJsonStr = data.slice("__VERSECRAFT_FINAL__:".length);
              sseFinalReceived = true;
              if (finalFrameMs === null) finalFrameMs = Date.now() - startMs;
            } else if (data.startsWith("__VERSECRAFT_STATUS__:")) {
              if (firstStatusMs === null) firstStatusMs = Date.now() - startMs;
              // Status frame, log for debugging
              try {
                const status = JSON.parse(data.slice("__VERSECRAFT_STATUS__:".length));
                if (status.type === "error") {
                  errors.push(`Status error: ${JSON.stringify(status)}`);
                }
              } catch { /* ignore parse errors */ }
            } else if (data.length > 0) {
              // Narrative content chunk
              if (firstTokenMs === null) firstTokenMs = Date.now() - startMs;
            }
          }
        }
      }

      // Parse final JSON
      if (finalJsonStr) {
        try {
          dmJson = JSON.parse(finalJsonStr) as Record<string, unknown>;
          parseSuccess = true;
          narrative = (dmJson.narrative as string) || "";
          if (Array.isArray(dmJson.options)) {
            options = dmJson.options as string[];
          }
          // Server-side visible site fallback is infrastructure evidence, not
          // a model turn: never let the gameplay Oracle judge it.
          const meta = dmJson.internal_meta as { action?: string; kind?: string; reason?: string } | undefined;
          if (meta?.action === "site_fallback") {
            errors.push(`site_fallback: ${meta.kind ?? "site_unavailable"} (${meta.reason ?? "no reason"})`);
          }
        } catch (parseErr) {
          errors.push(`Failed to parse __VERSECRAFT_FINAL__ JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
        }
      } else {
        // Fallback: try to accumulate all data as narrative
        errors.push("No __VERSECRAFT_FINAL__ frame received.");
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Live execution error: ${errMsg}`);
    if (/aborted due to timeout/i.test(errMsg)) {
      // This client's own AbortSignal fired before any server-side layer
      // surfaced a result — classify by what was observed so far.
      timeoutLayer = "game_runner";
      abortSource = `gameRunner AbortSignal.timeout(${liveTurnTimeoutMs()}ms)`;
      if (sseFinalReceived) timeoutLayer = "unknown"; // final seen but stream didn't end
    } else {
      timeoutLayer = "http_client";
      abortSource = errMsg.slice(0, 120);
    }
  }

  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;
  const errorClass = classifyTraceErrors(errors);

  appendLiveTiming(runId, {
    requestId,
    caseId: scenario.caseId,
    startedAt,
    serverAcceptedMs,
    preflightStartMs: null,
    preflightEndMs: null,
    mainModelStartMs: null,
    firstStatusMs,
    firstTokenMs,
    finalFrameMs,
    endedAtMs: durationMs,
    timeoutLayer,
    abortSource,
    provider: "gateway",
    model: process.env.AI_MODEL_MAIN || "live-gateway",
    routingAttempts: [],
    httpStatus,
    sseFinalReceived,
    parseSuccess,
  });

  return {
    traceId: `trace-${runId}-${scenario.caseId}-${round}`,
    runId,
    round,
    caseId: scenario.caseId,
    seed: scenario.seed,
    model: process.env.AI_MODEL_MAIN || "live-gateway",
    provider: "gateway",
    startedAt,
    endedAt,
    durationMs,
    preState: { live: true, scenarioId: scenario.caseId, sessionId },
    playerInput: scenario.playerInput,
    injectedFacts: [],
    rawModelOutput: JSON.stringify(dmJson ?? {}),
    parsedDmJson: dmJson,
    normalizedDmJson: dmJson,
    validatorOutput: null,
    proposedStateDelta: null,
    finalStateDelta: null,
    finalState: null,
    narrative,
    options,
    errors,
    errorClass,
    recoveryInfo: null,
    tokenUsage,
    latencyMs: durationMs,
  };
}

// ── Runner interface ──────────────────────────────────

export async function runScenario(
  scenario: SelfImproveScenario,
  runId: string,
  round: number,
): Promise<SelfImproveTrace> {
  // In live mode, execute ALL scenarios via live API.
  // In mock mode, always use mock execution.
  // The scenario.requiresLive flag is advisory for mixed-mode runs.
  const useLive = !isMockMode();
  if (useLive) {
    const trace = await executeLiveTurn(scenario, runId, round);
    // Controlled retry (第五节 D): a game_runner timeout means the upstream
    // stream stalled pathologically — the stall is per-connection, so one
    // retry with a fresh request (backoff 10s) usually succeeds. Never retry
    // parse failures or completed model results; those are real evidence.
    if (trace.errorClass === "infrastructure_failure" && trace.errors.some((e) => /aborted due to timeout/i.test(e))) {
      console.log(`[SelfImprove] Retrying ${scenario.caseId} once after game_runner timeout (10s backoff)...`);
      await new Promise((r) => setTimeout(r, 10_000));
      const retry = await executeLiveTurn(scenario, runId, round);
      (retry as SelfImproveTrace & { retriedAfterTimeout?: boolean }).retriedAfterTimeout = true;
      return retry;
    }
    return trace;
  }
  return executeMockTurn(scenario, runId, round);
}

export async function runScenarios(
  scenarios: SelfImproveScenario[],
  runId: string,
  round: number,
): Promise<SelfImproveTrace[]> {
  const state = getState();
  const concurrency = state?.budget.gameConcurrency ?? 4;

  const results: SelfImproveTrace[] = [];

  // Execute in batches for concurrency control
  for (let i = 0; i < scenarios.length; i += concurrency) {
    const batch = scenarios.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((s) => runScenario(s, runId, round)),
    );
    results.push(...batchResults);
  }

  return results;
}
