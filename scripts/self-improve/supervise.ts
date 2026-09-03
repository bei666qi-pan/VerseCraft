#!/usr/bin/env tsx
/**
 * Self-Improving Agent System — Supervisor v2
 *
 * Fixes:
 * 1. Managed dev server via child_process.spawn (not execSync)
 * 2. CODE_REPAIR execution state
 * 3. Backend capability detection
 *
 * Usage:
 *   pnpm self-improve:supervise -- --live --until-strict-pass --max-cycles 12
 */

import { spawn, exec, execSync, type ChildProcess } from "node:child_process";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { extractRunId, diffSnapshots, type WorkingTreeSnapshot } from "./supervisor-utils";
import { atomicWriteJsonSync, loadJsonWithFallback } from "../../src/lib/evals/selfImprove/atomicWrite";

// ── Backend capabilities ─────────────────────────────

interface BackendCapability {
  canAnalyze: boolean;
  canEditFiles: boolean;
  canRunTests: boolean;
  supportsResume: boolean;
  backendType: string;
}

const KNOWN_CODEX_PATHS = [
  "/Applications/ChatGPT.app/Contents/Resources/codex",
];

let resolvedCodexBin: string | null = null;

function discoverCodexBin(config: SupervisorConfig): { found: boolean; path: string; version: string; source: string } {
  // 1. CLI arg
  if (config.codexBin) {
    if (existsSync(config.codexBin)) {
      return { found: true, path: config.codexBin, version: "", source: "cli-arg" };
    }
  }
  // 2. Env var
  const envBin = process.env.SELF_IMPROVE_CODEX_BIN;
  if (envBin && existsSync(envBin)) {
    return { found: true, path: envBin, version: "", source: "env-var" };
  }
  // 3. Known paths
  for (const p of KNOWN_CODEX_PATHS) {
    if (existsSync(p)) {
      return { found: true, path: p, version: "", source: "known-path" };
    }
  }
  // 4. PATH lookup
  try {
    const result = execSync("command -v codex", { encoding: "utf-8", stdio: "pipe", timeout: 3000 }).trim();
    if (result && existsSync(result)) {
      return { found: true, path: result, version: "", source: "path-lookup" };
    }
  } catch { /* not in PATH */ }

  return { found: false, path: "", version: "", source: "not-found" };
}

function detectBackendCapability(backend: string, config: SupervisorConfig): BackendCapability {
  if (backend === "codex") {
    const discovery = discoverCodexBin(config);
    if (!discovery.found) {
      console.log("[Supervisor] Codex binary not found. Checked: CLI arg, SELF_IMPROVE_CODEX_BIN, known paths, PATH.");
      return { canAnalyze: false, canEditFiles: false, canRunTests: false, supportsResume: false, backendType: "codex-unavailable" };
    }
    resolvedCodexBin = discovery.path;
    try {
      const ver = execSync(`"${resolvedCodexBin}" --version`, { encoding: "utf-8", stdio: "pipe", timeout: 5000, env: process.env }).trim();
      console.log(`[Supervisor] Codex found: ${resolvedCodexBin} (${ver}, source: ${discovery.source})`);
    } catch {
      console.log(`[Supervisor] Codex found at ${resolvedCodexBin} but --version failed`);
      return { canAnalyte: false, canEditFiles: false, canRunTests: false, supportsResume: false, backendType: "codex-broken" };
    }
    // Verify exec --help
    try {
      execSync(`"${resolvedCodexBin}" exec --help`, { encoding: "utf-8", stdio: "pipe", timeout: 5000, env: process.env });
    } catch {
      console.log("[Supervisor] codex exec --help failed");
      return { canAnalyze: false, canEditFiles: false, canRunTests: false, supportsResume: false, backendType: "codex-no-exec" };
    }
    return { canAnalyze: true, canEditFiles: true, canRunTests: true, supportsResume: true, backendType: "codex" };
  }
  return { canAnalyze: true, canEditFiles: false, canRunTests: false, supportsResume: false, backendType: "advisory-only" };
}

// ── Managed Server ────────────────────────────────────

let serverProcess: ChildProcess | null = null;
const serverPort = 666;

function getBaseUrl(): string {
  return `http://localhost:${serverPort}`;
}

async function healthCheck(): Promise<boolean> {
  try {
    const resp = await fetch(`${getBaseUrl()}/`, { signal: AbortSignal.timeout(5000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function startManagedServer(workDir?: string): Promise<boolean> {
  const cwd = workDir || process.cwd();
  console.log(`[Supervisor] Starting managed dev server on port ${serverPort}...`);

  return new Promise((resolve) => {
    const logFile = join(cwd, ".runtime-data", "self-improve", "server.log");
    mkdirSync(join(cwd, ".runtime-data", "self-improve"), { recursive: true });
    const logStream = createWriteStream(logFile, { flags: "a" });

    const proc = spawn("pnpm", ["dev"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(serverPort) },
      detached: true,
    });

    serverProcess = proc;
    if (proc.pid) console.log(`[Supervisor] Server PID: ${proc.pid}`);

    proc.stdout.on("data", (d: Buffer) => logStream.write(d));
    proc.stderr.on("data", (d: Buffer) => logStream.write(d));

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.log("[Supervisor] Server start timed out");
        resolve(false);
      }
    }, 60_000);

    // Poll for readiness
    const poll = setInterval(async () => {
      if (resolved) { clearInterval(poll); return; }
      const healthy = await healthCheck();
      if (healthy) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(poll);
        console.log("[Supervisor] Server ready");
        resolve(true);
      }
    }, 2000);

    proc.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(poll);
        console.log(`[Supervisor] Server exited with code ${code} before ready`);
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(poll);
        console.log(`[Supervisor] Server error: ${err.message}`);
        resolve(false);
      }
    });
  });
}

function stopManagedServer(): void {
  if (serverProcess && serverProcess.pid) {
    console.log(`[Supervisor] Stopping server PID ${serverProcess.pid}...`);
    try {
      process.kill(-serverProcess.pid, "SIGTERM");
    } catch {
      serverProcess.kill("SIGTERM");
    }
    serverProcess = null;
  }
}

// ── Supervisor State ──────────────────────────────────

interface SupervisorState {
  campaignId: string;
  cycle: number;
  maxCycles: number;
  phase: string;
  evalRuns: string[];
  strictResults: Array<{ cycle: number; runId: string; passed: boolean; status: string; reasons: string[] }>;
  repairAttempts: Array<{ cycle: number; defectId: string; threadId?: string; changedFiles: string[]; success: boolean }>;
  errors: string[];
  startedAt: string;
  updatedAt: string;
}

function statePath(campaignId: string): string {
  return resolve(process.cwd(), `.runtime-data/self-improve/${campaignId}/supervisor-state.json`);
}

function isSupervisorState(v: unknown): v is SupervisorState {
  const s = v as SupervisorState;
  return !!s && typeof s.campaignId === "string" && typeof s.cycle === "number"
    && Array.isArray(s.evalRuns) && Array.isArray(s.strictResults)
    && Array.isArray(s.repairAttempts) && Array.isArray(s.errors);
}

function loadState(campaignId: string): SupervisorState | null {
  const p = statePath(campaignId);
  if (!existsSync(p)) return null;
  // Validated load with last-known-good fallback; corruption is reported
  // loudly by the helper instead of being silently treated as a fresh start.
  return loadJsonWithFallback<SupervisorState>(p, isSupervisorState).value;
}

function saveState(state: SupervisorState): void {
  const dir = resolve(process.cwd(), `.runtime-data/self-improve/${state.campaignId}`);
  mkdirSync(dir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  const r = atomicWriteJsonSync(statePath(state.campaignId), state);
  if (!r.ok) {
    console.error(`[Supervisor] WARNING: state write failed: ${r.error}`);
  }
}

function stateLog(state: SupervisorState, detail: Record<string, unknown> = {}): void {
  const entry = { campaignId: state.campaignId, cycle: state.cycle, state: state.phase, at: new Date().toISOString(), detail };
  console.log(`[Supervisor] ${state.phase} | cycle=${state.cycle} | ${JSON.stringify(detail)}`);
  const logDir = resolve(process.cwd(), `.runtime-data/self-improve/${state.campaignId}`);
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, "supervisor-events.jsonl"), JSON.stringify(entry) + "\n", "utf-8");
}

// ── Eval runner ───────────────────────────────────────

/**
 * execSync blocks the supervisor's event loop for the whole eval round, which
 * would starve the mid-eval wedge monitor. exec + Promise keeps the same
 * capture semantics (throw on non-zero with stdout/stderr attached) while
 * letting timers run.
 */
function execCapture(cmd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    exec(
      cmd,
      { encoding: "utf-8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, cwd: process.cwd() },
      (error, stdout, stderr) => {
        if (error) {
          (error as { stdout?: string; stderr?: string }).stdout = stdout ?? "";
          (error as { stdout?: string; stderr?: string }).stderr = stderr ?? "";
          rejectPromise(error);
        } else {
          resolvePromise(stdout ?? "");
        }
      }
    );
  });
}

async function runEvalRound(state: SupervisorState, config: SupervisorConfig): Promise<{ runId: string; ok: boolean; hasEvidence: boolean }> {
  state.phase = "EVAL_RUNNING";
  stateLog(state);

  // Live evals run multiple rounds against a dev server and regularly exceed
  // 5 minutes; BLOCKED / budget-exhausted runs exit non-zero but still leave
  // valid artifacts that the strict verifier must see.
  const concurrencyEnv = [
    config.gameConcurrency ? `SI_GAME_CONCURRENCY=${config.gameConcurrency}` : "",
    config.judgeConcurrency ? `SI_JUDGE_CONCURRENCY=${config.judgeConcurrency}` : "",
  ].filter(Boolean).join(" ");
  const cmd = `${concurrencyEnv} SI_LIVE_MODE=${config.live ? "1" : "0"} npx tsx --conditions=react-server scripts/self-improve/run.ts --profile smoke --max-rounds ${config.evalRounds ?? 3}`;
  try {
    // Parent timeout must outlive a legitimate multi-round live eval:
    // 14 turns × ~15s × evalRounds + judge ensemble can exceed 15 min.
    const output = await execCapture(cmd, 3_600_000);
    const runId = extractRunId(output) || `eval-${Date.now()}`;
    return { runId, ok: true, hasEvidence: true };
  } catch (e: any) {
    const output = (e.stdout || "") + (e.stderr || "") + (e.message || "");
    const extracted = extractRunId(output);
    const runId = extracted || `eval-${Date.now()}`;
    // A real si- runId means the run started and may have written artifacts;
    // only a fallback id means nothing verifiable exists.
    return { runId, ok: false, hasEvidence: extracted !== null };
  }
}

function runStrictCheck(runId: string): { passed: boolean; status: string; reasons: string[] } {
  const cmd = `npx tsx --conditions=react-server scripts/self-improve/verify-strict.ts --run-id ${runId}`;
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 30_000, cwd: process.cwd() });
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return { passed: result.passed, status: result.status, reasons: result.reasons || [] };
    }
    return { passed: true, status: "STRICT_PASS", reasons: [] };
  } catch (e: any) {
    const output = e.stdout || e.stderr || e.message || "";
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return { passed: result.passed, status: result.status, reasons: result.reasons || [] };
    }
    return { passed: false, status: "STRICT_FAIL", reasons: [output.slice(0, 200)] };
  }
}

// ── CODE_REPAIR state ─────────────────────────────────

/** Working-tree snapshot (`git status --porcelain -uall` + mtimes) as a repair baseline. */
function workingTreeSnapshot(): WorkingTreeSnapshot {
  const snap: WorkingTreeSnapshot = new Map();
  try {
    const out = execSync("git status --porcelain -uall", { encoding: "utf-8", stdio: "pipe", cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 });
    for (const line of out.split("\n").filter(Boolean)) {
      const status = line.slice(0, 2);
      const path = line.slice(3);
      let mtimeMs: number | null = null;
      try { mtimeMs = statSync(resolve(process.cwd(), path)).mtimeMs; } catch { /* dir or unreadable */ }
      snap.set(path, { status, mtimeMs });
    }
  } catch { /* git unavailable */ }
  return snap;
}

async function executeCodexRepair(
  state: SupervisorState,
  defectSignature: string,
  taskPrompt: string,
): Promise<{ threadId?: string; changedFiles: string[]; success: boolean; output: string }> {
  state.phase = "CODEX_REPAIR_STARTED";
  stateLog(state, { defectSignature });

  // Baseline BEFORE the repair so pre-existing dirty-tree entries and
  // untracked files are not misattributed to the repair backend.
  const baseline = workingTreeSnapshot();

  const codexBin = resolvedCodexBin || "codex";
  // NB: the executor parameter MUST NOT be named `resolve` — it would shadow
  // node:path's resolve() used inside the close/error handlers, hijacking path
  // resolution into prematurely resolving this promise with the cwd string
  // (observed: repair reported changedFiles=0 and wrote no logs despite the
  // backend having modified real files).
  return new Promise((resolvePromise) => {
    const proc = spawn(codexBin, ["exec", "--sandbox", "workspace-write"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
      env: process.env,
    });
    activeRepairProcess = proc;

    let stdout = "";
    let stderr = "";

    proc.stdin.write(taskPrompt);
    proc.stdin.end();

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      activeRepairProcess = null;
      const dbg = (msg: string) => {
        try {
          appendFileSync(
            resolve(process.cwd(), `.runtime-data/self-improve/${state.campaignId}/codex-repair-debug.log`),
            `${new Date().toISOString()} close-handler ${msg}\n`,
            "utf-8"
          );
        } catch { /* last-resort: nowhere else to report */ }
      };
      dbg(`enter code=${code} stdoutLen=${stdout.length} stderrLen=${stderr.length}`);
      const threadMatch = stdout.match(/thread[_-]?id[:\s]+(\S+)/i) || stderr.match(/thread[_-]?id[:\s]+(\S+)/i) || stderr.match(/session id[:\s]+(\S+)/i);
      const threadId = threadMatch ? threadMatch[1] : undefined;

      // Files that appeared or changed (incl. inside untracked dirs) vs baseline
      let changedFiles: string[] = [];
      try {
        changedFiles = diffSnapshots(baseline, workingTreeSnapshot());
        dbg(`diffSnapshots ok changed=${changedFiles.length}`);
      } catch (e) {
        dbg(`diffSnapshots THREW: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Persist full backend output for auditability
      try {
        const dir = resolve(process.cwd(), `.runtime-data/self-improve/${state.campaignId}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `codex-repair-cycle-${state.cycle}.log`), `threadId: ${threadId || "unknown"}\nexitCode: ${code}\n\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`, "utf-8");
        dbg("log write ok");
      } catch (e) {
        dbg(`log write THREW: ${e instanceof Error ? e.message : String(e)}`);
      }

      resolvePromise({
        threadId,
        changedFiles,
        // Success = the backend actually changed files. A timeout SIGTERM
        // (code=null) after the writer finished its edits must not discard
        // real work: observed codex exiting code 0 on its own, or being
        // killed at the 300s cap with 8 files already changed.
        success: changedFiles.length > 0,
        output: stdout.slice(-500) || stderr.slice(-500),
      });
    });

    proc.on("error", (err) => {
      activeRepairProcess = null;
      // Persist even on spawn/transport errors — a missing log was previously
      // indistinguishable from "backend ran but changed nothing".
      try {
        const dir = resolve(process.cwd(), `.runtime-data/self-improve/${state.campaignId}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `codex-repair-cycle-${state.cycle}.log`), `threadId: unknown\nspawnError: ${err.message}\n\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`, "utf-8");
      } catch { /* best effort */ }
      resolvePromise({ changedFiles: [], success: false, output: err.message });
    });
  });
}

// ── Config ────────────────────────────────────────────

interface SupervisorConfig {
  live: boolean;
  untilStrictPass: boolean;
  maxCycles: number;
  maxRepairAttempts: number;
  serverMode: "managed" | "external";
  serverCommand: string;
  baseUrl: string;
  repairBackend: string;
  resume: boolean;
  campaignId?: string;
  codexBin?: string;
  gameConcurrency?: number;
  judgeConcurrency?: number;
  /** Rounds per eval run; strict gate requires >= 3 clean rounds, so 1 could never pass. */
  evalRounds?: number;
}

// ── Main Supervisor ───────────────────────────────────

async function runSupervisor(config: SupervisorConfig): Promise<void> {
  // Unique per invocation (second precision + random suffix): two supervisor
  // processes must never share a campaign directory and overwrite each
  // other's state. Use --campaign-id + --resume to continue a prior campaign.
  const campaignId = config.campaignId || `campaign-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${Math.random().toString(36).slice(2, 6)}`;

  let state = loadState(campaignId);
  if (!state || !config.resume) {
    state = {
      campaignId, cycle: 0, maxCycles: config.maxCycles, phase: "INIT",
      evalRuns: [], strictResults: [], repairAttempts: [], errors: [],
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
  // Track for signal-driven persistence (state is mutated in place below).
  activeSupervisorState = state;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Supervisor v2: ${campaignId} | Live: ${config.live} | Backend: ${config.repairBackend}`);
  console.log(`${"=".repeat(60)}\n`);

  // Detect backend capability
  const backend = detectBackendCapability(config.repairBackend, config);
  stateLog(state, { event: "BACKEND_DETECTED", backend });

  if (!backend.canEditFiles && config.repairBackend !== "advisory-only") {
    console.log("[Supervisor] FATAL: Repair backend is not write-capable");
    console.log("Status: REPAIR_BACKEND_NOT_WRITE_CAPABLE");
    process.exit(4);
  }

  // Start managed server
  if (config.serverMode === "managed") {
    state.phase = "SERVER_STARTING";
    stateLog(state);
    const started = await startManagedServer();
    if (!started) {
      console.log("[Supervisor] FATAL: Managed server failed to start");
      state.errors.push("server_start_failed");
      saveState(state);
      process.exit(5);
    }
  } else {
    const healthy = await healthCheck();
    if (!healthy) {
      console.log("[Supervisor] FATAL: External server not healthy at " + config.baseUrl);
      process.exit(5);
    }
  }
  state.phase = "SERVER_READY";
  stateLog(state);

  // Main loop
  while (state.cycle < config.maxCycles) {
    state.cycle++;
    saveState(state);

    // Pre-cycle server health: a wedged dev server (observed: process alive
    // but not accepting requests after an upstream stream stall) poisons
    // every later cycle with 120s timeouts. Restart it before burning an
    // eval cycle on guaranteed-garbage evidence.
    if (config.serverMode === "managed") {
      const healthy = await healthCheck();
      if (!healthy) {
        console.log("[Supervisor] Pre-cycle health check FAILED — restarting managed server");
        stateLog(state, { event: "SERVER_RESTART_UNHEALTHY", cycle: state.cycle });
        stopManagedServer();
        await new Promise((r) => setTimeout(r, 2_000));
        const restarted = await startManagedServer();
        if (!restarted) {
          state.errors.push(`server_restart_failed_cycle_${state.cycle}`);
          state.phase = "SERVER_LIFECYCLE_FAILURE";
          stateLog(state);
          saveState(state);
          console.log("[Supervisor] FATAL: managed server restart failed");
          process.exit(5);
        }
        state.phase = "SERVER_READY";
        stateLog(state, { event: "SERVER_RESTARTED", cycle: state.cycle });
        saveState(state);
      }
    }

    // Eval round. Mid-eval wedge monitor: an upstream stream stall can wedge
    // the dev server mid-round (process alive, event loop saturated in a
    // socket OnClose storm; in-process timers starved, so route-level
    // watchdogs cannot fire). The supervisor is an external process whose
    // event loop stays healthy, so it probes and restarts the managed server
    // while the round keeps running. The in-flight scenario fails (classified
    // infra); later scenarios hit the fresh server instead of every one
    // timing out behind the wedge.
    let midEvalRestarting = false;
    const wedgeMonitor =
      config.serverMode === "managed"
        ? setInterval(() => {
            if (midEvalRestarting) return;
            void (async () => {
              const healthy = await healthCheck();
              if (healthy || midEvalRestarting) return;
              midEvalRestarting = true;
              console.log("[Supervisor] Mid-eval health check FAILED — restarting managed server");
              stateLog(state, { event: "SERVER_RESTART_MID_EVAL", cycle: state.cycle });
              stopManagedServer();
              await new Promise((r) => setTimeout(r, 2_000));
              const restarted = await startManagedServer();
              stateLog(state, {
                event: restarted ? "SERVER_RESTARTED" : "SERVER_RESTART_FAILED",
                cycle: state.cycle,
              });
              if (!restarted) {
                state.errors.push(`server_restart_failed_mid_eval_cycle_${state.cycle}`);
                saveState(state);
              }
              midEvalRestarting = false;
            })();
          }, 15_000)
        : null;
    let evalResult: { runId: string; ok: boolean; hasEvidence: boolean };
    try {
      evalResult = await runEvalRound(state, config);
    } finally {
      if (wedgeMonitor) clearInterval(wedgeMonitor);
    }
    state.evalRuns.push(evalResult.runId);
    stateLog(state, { runId: evalResult.runId, evalOk: evalResult.ok });
    saveState(state);

    if (!evalResult.ok) {
      state.errors.push(`eval_failed_cycle_${state.cycle}`);
      if (!evalResult.hasEvidence) {
        // Run never produced a verifiable runId — nothing to strict-check.
        continue;
      }
      // Non-zero exit (BLOCKED / budget exhausted) with real artifacts:
      // fall through and let the strict verifier judge the evidence.
    }

    // Strict check
    state.phase = "STRICT_CHECK";
    const strict = runStrictCheck(evalResult.runId);
    state.strictResults.push({ cycle: state.cycle, runId: evalResult.runId, ...strict });
    stateLog(state, { strictStatus: strict.status, reasons: strict.reasons, evalOk: evalResult.ok });
    saveState(state);

    if (strict.passed && strict.status === "STRICT_PASS") {
      state.phase = "DONE";
      stateLog(state, { event: "STRICT_PASS" });
      saveState(state);
      console.log(`\n✅ STRICT_FULL_REPAIR_LOOP_VERIFIED at cycle ${state.cycle}`);
      stopManagedServer();
      process.exit(0);
    }

    if (strict.status === "INSUFFICIENT_EVIDENCE") {
      state.phase = "GATHERING_EVIDENCE";
      stateLog(state, { event: "CONTINUING_FOR_EVIDENCE" });
      continue;
    }

    if (strict.status === "EXTERNAL_MODEL_BLOCKED") {
      // Gateway/auth failure dominates the evidence. This is NOT a gameplay
      // defect: never feed it to the Codex Writer. Stop with a distinct exit
      // code so operators can distinguish infra blockage from repair failure.
      state.phase = "EXTERNAL_MODEL_BLOCKED";
      stateLog(state, { event: "EXTERNAL_MODEL_BLOCKED", reasons: strict.reasons });
      saveState(state);
      console.log("\n⛔ EXTERNAL_MODEL_BLOCKED — external gateway/auth failure dominates evidence; repair loop halted (exit 2)");
      stopManagedServer();
      process.exit(2);
    }

    if (strict.status === "GATE_TAMPERING_DETECTED") {
      state.phase = "GATE_TAMPERING_DETECTED";
      stateLog(state, { event: "GATE_TAMPERING_DETECTED", reasons: strict.reasons });
      saveState(state);
      console.log("\n⛔ GATE_TAMPERING_DETECTED — holdout/gate evidence inconsistent; repair loop halted (exit 3)");
      stopManagedServer();
      process.exit(3);
    }

    if (strict.status === "STRICT_FAIL") {
      // Attempt repair via Codex backend
      if (!backend.canEditFiles) {
        console.log("[Supervisor] STRICT_FAIL but backend is advisory-only — continuing eval");
        continue;
      }

      state.phase = "BUILD_REPAIR_TASK";
      stateLog(state);

      // 第六节：Repair Queue 只接受真实玩法缺陷。从 deterministic-results.json
      // 读取每个 case 的 errorClass，过滤掉 infrastructure_failure /
      // model_unavailable / external_blocked / insufficient_evidence——
      // 网络与模型不可用绝不送给 Codex Writer。
      const REPAIRABLE_CLASSES = new Set(["product_defect", "parse_contract_defect"]);
      const detPath = resolve(process.cwd(), `.runtime-data/self-improve/${evalResult.runId}/deterministic-results.json`);
      let repairableCases: string[] = [];
      const excludedCases: string[] = [];
      // Per-case failure evidence (invariant expected/actual/severity) so the
      // repair backend receives actionable input instead of bare case IDs —
      // observed: a bare-ID task produced CODEX_REPAIR_COMPLETED with 0 files.
      const defectEvidence: string[] = [];
      try {
        const detResults = JSON.parse(readFileSync(detPath, "utf-8")) as Array<{
          caseId: string; passed?: boolean; errorClass?: string;
          errors?: string[];
          invariantResults?: Array<{ invariantId?: string; check?: string; expected?: string; actual?: string; passed?: boolean; severity?: string }>;
        }>;
        for (const r of detResults) {
          const failed = r.passed === false || (r.invariantResults ?? []).some((i) => i.passed === false);
          if (!failed) continue;
          const ec = r.errorClass ?? "product_defect";
          if (REPAIRABLE_CLASSES.has(ec)) {
            repairableCases.push(r.caseId);
            const failedInvariants = (r.invariantResults ?? [])
              .filter((i) => i.passed === false)
              .map((i) => `    - ${i.invariantId ?? i.check ?? "unknown"} [${i.severity ?? "?"}] expected=${i.expected ?? "?"} actual=${i.actual ?? "?"}`);
            defectEvidence.push(`  - ${r.caseId}:\n${failedInvariants.join("\n") || "    - (no invariant detail recorded)"}${(r.errors ?? []).length ? `\n    errors: ${(r.errors ?? []).join("; ").slice(0, 200)}` : ""}`);
          } else {
            excludedCases.push(`${r.caseId}(${ec})`);
          }
        }
      } catch {
        // Artifacts unreadable: fall back to strict reason text (legacy path).
        repairableCases = strict.reasons.filter(r => r.includes("Failing") || r.includes("failing"));
      }

      if (excludedCases.length > 0) {
        stateLog(state, { event: "REPAIR_QUEUE_INFRA_EXCLUDED", excludedCases });
        console.log(`[Supervisor] Excluded non-gameplay cases from repair queue: ${excludedCases.join(", ")}`);
      }

      // Holdout regressions are real product defects but live in
      // holdout-results.json, not deterministic-results.json — recover them
      // from the strict reason text so they remain repairable.
      for (const reason of strict.reasons) {
        const m = reason.match(/Holdout regression: (.+)/);
        if (m) {
          for (const entry of m[1].split(",").map((s) => s.trim())) {
            const caseId = entry.replace(/\(.*\)$/, "");
            if (caseId && !repairableCases.includes(caseId)) repairableCases.push(caseId);
          }
        }
      }

      if (repairableCases.length === 0) {
        console.log("[Supervisor] STRICT_FAIL but no repairable product defects (all infra/model/external) — gathering more evidence instead of invoking Writer");
        state.phase = "GATHERING_EVIDENCE";
        stateLog(state, { event: "REPAIR_QUEUE_EMPTY_AFTER_FILTER" });
        saveState(state);
        continue;
      }

      const defectSig = repairableCases.join("; ").slice(0, 200);
      const taskPrompt = [
        `Fix the following defects in the VerseCraft codebase:`,
        defectSig,
        ``,
        `Failure evidence (from the live eval deterministic results):`,
        ...(defectEvidence.length > 0 ? defectEvidence : [`  (evidence unavailable — inspect .runtime-data/self-improve/${evalResult.runId}/deterministic-results.json yourself)`]),
        ``,
        `First add a failing regression test, then fix the production code that the test exercises.`,
        `Hard constraints:`,
        `- Do NOT modify any test expectations, gate thresholds, or holdout files.`,
        `- Do NOT touch the strict gate itself: src/lib/evals/selfImprove/strictVerifier.ts,`,
        `  src/lib/evals/selfImprove/strictVerifier.test.ts, scripts/self-improve/verify-strict.ts,`,
        `  scripts/self-improve/supervise.ts.`,
        `- Do NOT modify eval infrastructure to make failures disappear; fix gameplay/production code only.`,
        `- If the failing cases are caused by live-request timeouts rather than game logic, make NO changes and report that instead.`,
      ].join("\n");

      // Persist the exact task for auditability (the backend receives it via stdin).
      try {
        const dir = resolve(process.cwd(), `.runtime-data/self-improve/${state.campaignId}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `repair-task-cycle-${state.cycle}.md`), taskPrompt, "utf-8");
      } catch { /* best effort */ }

      let repairResult: { threadId?: string; changedFiles: string[]; success: boolean; output: string };
      try {
        repairResult = await executeCodexRepair(state, defectSig, taskPrompt);
      } catch (e: any) {
        state.phase = "REPAIR_BACKEND_ERROR";
        stateLog(state, { error: e?.message, stack: String(e?.stack ?? "").slice(0, 800) });
        state.repairAttempts.push({ cycle: state.cycle, defectId: defectSig, changedFiles: [], success: false });
        saveState(state);
        continue;
      }
      const changedFiles = repairResult?.changedFiles ?? [];
      state.phase = "CODEX_REPAIR_COMPLETED";
      state.repairAttempts.push({
        cycle: state.cycle, defectId: defectSig,
        threadId: repairResult.threadId,
        changedFiles,
        success: repairResult.success,
      });
      stateLog(state, {
        threadId: repairResult.threadId,
        changedFiles: changedFiles.length,
        repairSuccess: repairResult.success,
      });
      saveState(state);

      if (repairResult.success) {
        state.phase = "FILES_CHANGED";
        stateLog(state, { changedFiles });
      } else {
        state.phase = "REPAIR_BACKEND_NO_CHANGES";
        stateLog(state, { reason: "No files were modified by the repair backend" });
      }
      continue;
    }
  }

  // Exhausted
  state.phase = "MAX_CYCLES_REACHED";
  stateLog(state);
  saveState(state);

  const lastRunId = state.evalRuns[state.evalRuns.length - 1];
  if (lastRunId) {
    const final = runStrictCheck(lastRunId);
    if (final.passed) {
      console.log("STRICT_FULL_REPAIR_LOOP_VERIFIED");
      stopManagedServer();
      process.exit(0);
    }
  }
  console.log("REPAIR_ATTEMPTS_EXHAUSTED");
  stopManagedServer();
  process.exit(1);
}

// ── CLI ───────────────────────────────────────────────

function parseArgs(): SupervisorConfig {
  const args = process.argv.slice(2);
  const cfg: SupervisorConfig = {
    live: false, untilStrictPass: false, maxCycles: 12, maxRepairAttempts: 3,
    serverMode: "managed", serverCommand: "pnpm dev", baseUrl: "http://localhost:666",
    repairBackend: "codex", resume: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--live": cfg.live = true; break;
      case "--until-strict-pass": cfg.untilStrictPass = true; break;
      case "--max-cycles": cfg.maxCycles = parseInt(args[++i] || "12", 10); break;
      case "--max-repair-attempts": cfg.maxRepairAttempts = parseInt(args[++i] || "3", 10); break;
      case "--server-mode": cfg.serverMode = (args[++i] as "managed" | "external") || "managed"; break;
      case "--server-command": cfg.serverCommand = args[++i] || "pnpm dev"; break;
      case "--base-url": cfg.baseUrl = args[++i] || "http://localhost:666"; break;
      case "--repair-backend": cfg.repairBackend = args[++i] || "codex"; break;
      case "--resume": cfg.resume = true; break;
      case "--codex-bin": cfg.codexBin = args[++i]; break;
      case "--campaign-id": cfg.campaignId = args[++i]; break;
      case "--game-concurrency": cfg.gameConcurrency = parseInt(args[++i] || "1", 10); break;
      case "--judge-concurrency": cfg.judgeConcurrency = parseInt(args[++i] || "1", 10); break;
      case "--eval-rounds": cfg.evalRounds = parseInt(args[++i] || "3", 10); break;
    }
  }
  if (cfg.live) process.env.SI_LIVE_MODE = "1";
  return cfg;
}

// Handle cleanup
let activeRepairProcess: ChildProcess | null = null;
let activeSupervisorState: SupervisorState | null = null;
function stopRepairProcess(): void {
  if (activeRepairProcess) {
    try { activeRepairProcess.kill("SIGTERM"); } catch { /* already gone */ }
    activeRepairProcess = null;
  }
}
/** Persist last-known state before signal-driven exit (sync write is safe here). */
function persistStateOnSignal(): void {
  if (activeSupervisorState) {
    try {
      activeSupervisorState.phase = "INTERRUPTED";
      saveState(activeSupervisorState);
    } catch { /* best effort during signal handling */ }
  }
}
process.on("SIGINT", () => { persistStateOnSignal(); stopRepairProcess(); stopManagedServer(); process.exit(0); });
process.on("SIGTERM", () => { persistStateOnSignal(); stopRepairProcess(); stopManagedServer(); process.exit(0); });
process.on("exit", () => { stopRepairProcess(); stopManagedServer(); });

const config = parseArgs();
runSupervisor(config).catch((e) => {
  console.error("Supervisor fatal:", e);
  stopManagedServer();
  process.exit(3);
});
