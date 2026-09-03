#!/usr/bin/env node
/**
 * verse -ds Daemon — background process manager.
 *
 * Responsibilities:
 *   1. Create isolated worktree from origin/main
 *   2. Run preflight checks
 *   3. Start Supervisor as managed child process
 *   4. Start Watchdog as sibling process
 *   5. Handle signals, cleanup, and session lifecycle
 */

import {
  createSession, getActiveSession, updateSession,
  appendEvent, releaseLock, getSession, deactivateSession,
} from "./ds-session-store.mjs";
import { spawn, execSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { runWatchdog, stop as stopWatchdog } from "./ds-watchdog.mjs";

// ── Config ─────────────────────────────────────────────

const REPO_ROOT = process.env.VERSECRAFT_REPO || "/Users/qi/Desktop/VerseCraft";
const CODEX_BIN = process.env.SELF_IMPROVE_CODEX_BIN || "/Applications/ChatGPT.app/Contents/Resources/codex";
const MAX_CYCLES = parseInt(process.env.SI_MAX_CYCLES || "4", 10);
const MAX_LIVE_CALLS = parseInt(process.env.SI_MAX_LIVE_CALLS || "400", 10);
const WORKTREE_BASE = resolve(homedir(), "Desktop");

// ── Helpers ────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 30000, ...opts });
  } catch {
    return null;
  }
}

// ── Preflight ──────────────────────────────────────────

async function runPreflight(session, worktree) {
  appendEvent(session.sessionId, { type: "PREFLIGHT_START" });

  const checks = [];

  // 1. Codex binary
  const codexExists = existsSync(CODEX_BIN);
  checks.push({ check: "codex_binary", passed: codexExists, detail: CODEX_BIN });

  // 2. Direct Gateway Main small
  if (codexExists) {
    try {
      execSync(
        `cd "${worktree}" && pnpm probe:ai-gateway -- --role main --prompt-profile small --runs 1 --warmup-runs 0 --timeout-ms 60000`,
        { encoding: "utf-8", timeout: 90000, stdio: "pipe", env: { ...process.env, NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1", NODE_USE_ENV_PROXY: "0" } }
      );
      checks.push({ check: "gateway_main_small", passed: true, detail: "ok" });
    } catch (e) {
      checks.push({ check: "gateway_main_small", passed: false, detail: (e.stderr || e.message || "").slice(0, 200) });
    }
  }

  // 3. Managed Server health
  try {
    const health = execSync("curl -s -o /dev/null -w '%{http_code}' http://localhost:666", {
      encoding: "utf-8", timeout: 10000, stdio: "pipe",
    }).trim();
    checks.push({ check: "server_health", passed: health === "200", detail: `HTTP ${health}` });
  } catch {
    // Server might not be up yet during preflight; non-fatal for preflight
    checks.push({ check: "server_health", passed: false, detail: "not yet available (will retry)" });
  }

  // 4. Disk space
  try {
    const df = execSync("df -h .", { encoding: "utf-8", timeout: 5000, stdio: "pipe" });
    const pctMatch = df.match(/(\d+)%/);
    if (pctMatch) {
      const pct = parseInt(pctMatch[1], 10);
      checks.push({ check: "disk_space", passed: pct < 90, detail: `${pct}% used` });
    }
  } catch {
    checks.push({ check: "disk_space", passed: true, detail: "unable to check" });
  }

  // 5. Port 666 available
  try {
    const portCheck = execSync("lsof -i :666 2>/dev/null | grep LISTEN", {
      encoding: "utf-8", timeout: 5000, stdio: "pipe",
    }).trim();
    if (portCheck) {
      checks.push({ check: "port_666", passed: false, detail: "Port 666 already in use" });
    } else {
      checks.push({ check: "port_666", passed: true, detail: "available" });
    }
  } catch {
    checks.push({ check: "port_666", passed: true, detail: "available" });
  }

  const allPassed = checks.every(c => c.passed);
  appendEvent(session.sessionId, { type: "PREFLIGHT_DONE", allPassed, checks });

  return { allPassed, checks };
}

// ── Worktree creation ──────────────────────────────────

function createWorktree(session) {
  const ts = timestamp();
  const branch = `self-improve/campaign-${ts}`;
  const worktreePath = join(WORKTREE_BASE, `VerseCraft-self-improve-${ts}`);

  appendEvent(session.sessionId, { type: "WORKTREE_CREATE_START", branch, worktree: worktreePath });

  // git fetch origin
  console.log("[Daemon] Fetching origin...");
  run(`cd "${REPO_ROOT}" && git fetch origin`, { timeout: 60000 });

  // Verify origin/main has required scripts
  const mainPkg = run(`cd "${REPO_ROOT}" && git show origin/main:package.json`);
  if (!mainPkg) {
    appendEvent(session.sessionId, { type: "MAIN_NOT_READY", reason: "Cannot read origin/main package.json" });
    return { error: "MAIN_NOT_READY", detail: "Cannot read origin/main package.json" };
  }

  try {
    const pkg = JSON.parse(mainPkg);
    if (!pkg.scripts || !pkg.scripts["self-improve:supervise"]) {
      appendEvent(session.sessionId, { type: "MAIN_NOT_READY", reason: "self-improve:supervise not found in origin/main" });
      return { error: "MAIN_NOT_READY", detail: "self-improve:supervise not found in origin/main" };
    }
  } catch {
    appendEvent(session.sessionId, { type: "MAIN_NOT_READY", reason: "Cannot parse origin/main package.json" });
    return { error: "MAIN_NOT_READY", detail: "Cannot parse origin/main package.json" };
  }

  // Create branch
  run(`cd "${REPO_ROOT}" && git branch "${branch}" origin/main`);

  // Create worktree
  const wtResult = run(`cd "${REPO_ROOT}" && git worktree add "${worktreePath}" "${branch}"`);
  if (wtResult === null) {
    appendEvent(session.sessionId, { type: "WORKTREE_FAILED", reason: "git worktree add failed" });
    return { error: "WORKTREE_FAILED", detail: "git worktree add failed" };
  }

  // Verify porcelain clean
  const porcelain = run(`cd "${worktreePath}" && git status --porcelain`);
  if (porcelain && porcelain.trim()) {
    appendEvent(session.sessionId, { type: "WORKTREE_DIRTY", porcelain: porcelain.trim().slice(0, 500) });
    return { error: "WORKTREE_DIRTY", detail: "Worktree is not clean" };
  }

  // Link .env.local
  const envLocalSrc = join(REPO_ROOT, ".env.local");
  const envLocalDst = join(worktreePath, ".env.local");
  if (existsSync(envLocalSrc) && !existsSync(envLocalDst)) {
    symlinkSync(envLocalSrc, envLocalDst);
  }

  // Install deps
  console.log("[Daemon] Installing dependencies...");
  const installResult = run(`cd "${worktreePath}" && pnpm install --frozen-lockfile`, { timeout: 120000 });
  if (installResult === null) {
    appendEvent(session.sessionId, { type: "INSTALL_FAILED" });
    return { error: "INSTALL_FAILED", detail: "pnpm install --frozen-lockfile failed" };
  }

  // Get HEAD SHA
  const headSha = run(`cd "${worktreePath}" && git rev-parse HEAD`)?.trim();

  appendEvent(session.sessionId, { type: "WORKTREE_CREATED", branch, worktree: worktreePath, headSha });

  return {
    success: true,
    branch,
    worktree: worktreePath,
    headSha,
  };
}

// ── Start Supervisor ───────────────────────────────────

function startSupervisor(session) {
  if (!session.worktree) return null;

  console.log("[Daemon] Starting Supervisor...");
  appendEvent(session.sessionId, { type: "SUPERVISOR_START" });

  const env = {
    ...process.env,
    SELF_IMPROVE_CODEX_BIN: CODEX_BIN,
    SI_MAX_LIVE_CALLS: String(MAX_LIVE_CALLS),
    NO_PROXY: "localhost,127.0.0.1",
    no_proxy: "localhost,127.0.0.1",
    NODE_USE_ENV_PROXY: "0",
  };

  const args = [
    "self-improve:supervise",
    "--",
    "--live",
    "--until-strict-pass",
    `--max-cycles`, String(MAX_CYCLES),
    "--repair-backend", "codex",
    "--game-concurrency", "1",
    "--judge-concurrency", "1",
    "--eval-rounds", "3",
  ];

  const child = spawn("pnpm", args, {
    cwd: session.worktree,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  child.stdout?.on("data", (data) => {
    const text = data.toString();
    // Detect run ID from output
    const runMatch = text.match(/Run (si-[\w-]+) started/);
    if (runMatch) {
      appendEvent(session.sessionId, { type: "EVAL_RUN_DETECTED", runId: runMatch[1] });
    }
    // Detect campaign ID
    const campaignMatch = text.match(/Supervisor v2: (campaign-[\w-]+)/);
    if (campaignMatch) {
      updateSession(session.sessionId, { campaignId: campaignMatch[1] });
    }
    // Detect phase changes
    const phaseMatch = text.match(/\[Supervisor\] (\w+)\s*\|/);
    if (phaseMatch) {
      updateSession(session.sessionId, { phase: phaseMatch[1] });
    }
    process.stdout.write(text);
  });

  child.stderr?.on("data", (data) => {
    process.stderr.write(data);
  });

  child.on("exit", (code) => {
    appendEvent(session.sessionId, { type: "SUPERVISOR_EXIT", exitCode: code });

    const session2 = getSession(session.sessionId);
    if (session2) {
      updateSession(session.sessionId, {
        state: code === 0 ? "COMPLETED" : "FAILED",
        exitCode: code,
        endedAt: new Date().toISOString(),
      });
    }
  });

  return child;
}

// ── Start Watchdog ─────────────────────────────────────

function startWatchdog(session) {
  console.log("[Daemon] Starting Watchdog...");
  appendEvent(session.sessionId, { type: "WATCHDOG_START" });

  // Run watchdog in the same process (it uses setInterval)
  runWatchdog(30_000).catch(err => {
    console.error("[Daemon] Watchdog error:", err);
  });

  return { stop: stopWatchdog };
}

// ── Main daemon ────────────────────────────────────────

async function startDaemon() {
  // Check for existing session
  const existing = getActiveSession();
  if (existing && (existing.state === "RUNNING" || existing.state === "STARTING")) {
    console.log(`[Daemon] Active session already exists: ${existing.sessionId}`);
    return existing;
  }

  console.log("[Daemon] Starting new self-improving campaign...");

  // Create session
  const session = createSession();
  console.log(`[Daemon] Session: ${session.sessionId}`);

  // Create worktree
  const wt = createWorktree(session);
  if (wt.error) {
    updateSession(session.sessionId, {
      state: "FAILED",
      finalStatus: wt.error,
      endedAt: new Date().toISOString(),
    });
    console.error(`[Daemon] Failed: ${wt.error} - ${wt.detail}`);
    return session;
  }

  // Update session with worktree info
  updateSession(session.sessionId, {
    branch: wt.branch,
    worktree: wt.worktree,
    state: "STARTING",
  });

  // Run preflight
  console.log("[Daemon] Running preflight checks...");
  const preflight = await runPreflight(session, wt.worktree);
  if (!preflight.allPassed) {
    const fails = preflight.checks.filter(c => !c.passed).map(c => c.check).join(", ");
    updateSession(session.sessionId, {
      state: "FAILED",
      finalStatus: "PREFLIGHT_FAILED",
      endedAt: new Date().toISOString(),
    });
    console.error(`[Daemon] Preflight failed: ${fails}`);
    return session;
  }

  // Start watchdog first (it monitors the supervisor)
  startWatchdog(session);

  // Start supervisor
  const supProc = startSupervisor(session);
  if (!supProc) {
    updateSession(session.sessionId, {
      state: "FAILED",
      finalStatus: "SUPERVISOR_START_FAILED",
      endedAt: new Date().toISOString(),
    });
    return session;
  }

  // Update session
  updateSession(session.sessionId, {
    state: "RUNNING",
    supervisorPid: supProc.pid,
  });

  console.log(`[Daemon] Supervisor PID: ${supProc.pid}`);
  console.log(`[Daemon] Campaign running. Use ${"verse -ds"} to view dashboard.`);

  return session;
}

// ── Stop daemon ────────────────────────────────────────

async function stopDaemon() {
  const session = getActiveSession();
  if (!session) {
    console.log("[Daemon] No active session to stop.");
    return;
  }

  console.log(`[Daemon] Stopping session ${session.sessionId}...`);
  appendEvent(session.sessionId, { type: "STOP_REQUESTED" });
  updateSession(session.sessionId, { state: "STOPPING" });

  // Stop watchdog
  stopWatchdog();

  // SIGTERM supervisor
  if (session.supervisorPid) {
    try { process.kill(session.supervisorPid, "SIGTERM"); } catch { /* ignore */ }
  }

  // SIGTERM server
  if (session.serverPid) {
    try { process.kill(session.serverPid, "SIGTERM"); } catch { /* ignore */ }
  }

  // Wait for graceful shutdown
  await new Promise(r => setTimeout(r, 10_000));

  // Force kill if still alive
  if (session.supervisorPid) {
    try { process.kill(session.supervisorPid, "SIGKILL"); } catch { /* ignore */ }
  }
  if (session.serverPid) {
    try { process.kill(session.serverPid, "SIGKILL"); } catch { /* ignore */ }
  }

  updateSession(session.sessionId, {
    state: "STOPPED",
    endedAt: new Date().toISOString(),
    finalStatus: "STOPPED",
  });

  deactivateSession(session.sessionId);
  releaseLock();

  console.log("[Daemon] Stopped.");
}

// ── Export ─────────────────────────────────────────────

export {
  startDaemon,
  stopDaemon,
  createWorktree,
  runPreflight,
  startSupervisor,
};
