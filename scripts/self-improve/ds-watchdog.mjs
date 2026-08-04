#!/usr/bin/env node
/**
 * Deterministic Watchdog — monitors campaign health & auto-recovers.
 *
 * Runs as a subprocess of the daemon. Checks every 30s:
 *   - PID liveness
 *   - State file updates
 *   - Event progress
 *   - Phase deadlines
 *   - Server health
 *
 * Recovery tiers:
 *   1. Grace period (wait + re-check)
 *   2. SIGTERM stuck child + restart managed server + resume campaign
 *   3. Observer Agent diagnosis → structured recovery action
 *   Max 2 auto-recoveries per failure class before MANUAL_REVIEW_REQUIRED.
 */

import {
  getActiveSession, getSession, saveSession, appendEvent,
  readJson, writeJson, ensureDir
} from "./ds-session-store.mjs";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, execSync } from "node:child_process";

// ── Configurable deadlines (ms) ────────────────────────

const DEFAULT_DEADLINES = {
  SERVER_STARTING: 5 * 60_000,
  EVAL_RUNNING: 15 * 60_000,
  CODEX_REPAIR_RUNNING: 25 * 60_000,
  TESTS_RUNNING: 30 * 60_000,
  TARGETED_REEVAL: 15 * 60_000,
  STRICT_CHECK: 5 * 60_000,
  SESSION_TOTAL: 6 * 60 * 60_000,
};

// Override via env
function getDeadlines() {
  const dl = { ...DEFAULT_DEADLINES };
  const override = process.env.VERSECRAFT_DS_DEADLINES;
  if (override) {
    try {
      const parsed = JSON.parse(override);
      Object.assign(dl, parsed);
    } catch { /* ignore */ }
  }
  return dl;
}

// ── Helpers ────────────────────────────────────────────

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function fileAgeMs(path) {
  try { return Date.now() - statSync(path).mtimeMs; } catch { return Infinity; }
}

function loadSupervisorEvents(worktree) {
  if (!worktree) return [];
  try {
    const dir = join(worktree, ".runtime-data", "self-improve");
    const campaigns = readdirSync(dir).filter(d => d.startsWith("campaign-")).sort().reverse();
    if (campaigns.length === 0) return [];
    const eventsPath = join(dir, campaigns[0], "supervisor-events.jsonl");
    if (!existsSync(eventsPath)) return [];
    const lines = readFileSync(eventsPath, "utf-8").trim().split("\n").filter(Boolean);
    return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function getLatestPhase(session) {
  const events = loadSupervisorEvents(session?.worktree);
  if (events.length === 0) return null;

  // Extract phase from events
  const stateEvents = events.filter(e => e.state && typeof e.state === "string");
  if (stateEvents.length === 0) return null;

  const latest = stateEvents[stateEvents.length - 1];
  return {
    phase: latest.state,
    cycle: latest.cycle || 0,
    at: latest.at || latest.ts,
  };
}

function checkServerHealth(port = 666) {
  try {
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    }).trim();
    return result === "200" || result === "302" || result === "304";
  } catch {
    return false;
  }
}

// ── Stall detection ────────────────────────────────────

let lastPhaseCheck = { phase: null, cycle: 0, unchangedSince: Date.now(), alertCount: 0 };

function detectStall(session) {
  const phaseInfo = getLatestPhase(session);
  const deadlines = getDeadlines();
  const now = Date.now();

  if (!phaseInfo) return { stalled: false };

  // Check if phase changed
  const phaseKey = `${phaseInfo.phase}-${phaseInfo.cycle}`;
  if (phaseKey !== `${lastPhaseCheck.phase}-${lastPhaseCheck.cycle}`) {
    lastPhaseCheck = { phase: phaseInfo.phase, cycle: phaseInfo.cycle, unchangedSince: now, alertCount: 0 };
    return { stalled: false };
  }

  const unchangedMs = now - lastPhaseCheck.unchangedSince;
  const deadline = deadlines[phaseInfo.phase] || 15 * 60_000;

  if (unchangedMs > deadline) {
    lastPhaseCheck.alertCount++;
    return {
      stalled: true,
      phase: phaseInfo.phase,
      cycle: phaseInfo.cycle,
      unchangedMs,
      deadline,
      alertCount: lastPhaseCheck.alertCount,
    };
  }

  return { stalled: false };
}

// ── Server state file age ──────────────────────────────

function getStateFileAge(session) {
  if (!session?.worktree) return Infinity;
  const statePath = join(session.worktree, ".runtime-data", "self-improve");
  try {
    const campaigns = readdirSync(statePath).filter(d => d.startsWith("campaign-")).sort().reverse();
    if (campaigns.length === 0) return Infinity;
    return fileAgeMs(join(statePath, campaigns[0], "supervisor-state.json"));
  } catch { return Infinity; }
}

// ── Recovery ───────────────────────────────────────────

const RECOVERY_CLASSES = {};

async function attemptRecovery(session, stallInfo, worktree) {
  const recoveryClass = `${stallInfo.phase}-${stallInfo.cycle}`;
  RECOVERY_CLASSES[recoveryClass] = (RECOVERY_CLASSES[recoveryClass] || 0) + 1;

  if (RECOVERY_CLASSES[recoveryClass] > 2) {
    appendEvent(session.sessionId, { type: "RECOVERY", level: "MAX_RETRIES", recoveryClass, count: RECOVERY_CLASSES[recoveryClass] });
    return { action: "MANUAL_REVIEW_REQUIRED", reason: `Max recovery retries for ${recoveryClass}` };
  }

  const level = RECOVERY_CLASSES[recoveryClass];

  appendEvent(session.sessionId, {
    type: "RECOVERY_START",
    level,
    recoveryClass,
    phase: stallInfo.phase,
    cycle: stallInfo.cycle,
    unchangedMs: stallInfo.unchangedMs,
  });

  // Level 1: Grace period + health check
  if (level === 1) {
    appendEvent(session.sessionId, { type: "RECOVERY", level: 1, action: "GRACE_PERIOD" });
    // Wait 30s and re-check
    await new Promise(r => setTimeout(r, 30_000));

    // Check if resolved
    const newPhase = getLatestPhase(session);
    if (newPhase && `${newPhase.phase}-${newPhase.cycle}` !== `${stallInfo.phase}-${stallInfo.cycle}`) {
      appendEvent(session.sessionId, { type: "RECOVERY", level: 1, result: "RESOLVED" });
      return { action: "RESOLVED" };
    }

    // Check server
    const serverHealthy = checkServerHealth(666);
    appendEvent(session.sessionId, { type: "RECOVERY", level: 1, serverHealthy });

    if (!serverHealthy) {
      return { action: "RESTART_SERVER", reason: "Server health check failed" };
    }
  }

  // Level 2: Kill stuck child, restart server, resume
  if (level === 2) {
    appendEvent(session.sessionId, { type: "RECOVERY", level: 2, action: "RESTART_CHILDREN" });

    // SIGTERM supervisor and server
    if (session.supervisorPid && pidAlive(session.supervisorPid)) {
      try { process.kill(session.supervisorPid, "SIGTERM"); } catch { /* ignore */ }
    }
    if (session.serverPid && pidAlive(session.serverPid)) {
      try { process.kill(session.serverPid, "SIGTERM"); } catch { /* ignore */ }
    }

    await new Promise(r => setTimeout(r, 20_000));

    // SIGKILL if still alive
    if (session.supervisorPid && pidAlive(session.supervisorPid)) {
      try { process.kill(session.supervisorPid, "SIGKILL"); } catch { /* ignore */ }
    }
    if (session.serverPid && pidAlive(session.serverPid)) {
      try { process.kill(session.serverPid, "SIGKILL"); } catch { /* ignore */ }
    }

    appendEvent(session.sessionId, { type: "RECOVERY", level: 2, action: "RESTART_SERVER" });

    // Restart managed server
    try {
      const serverProc = spawn("pnpm", ["dev"], {
        cwd: worktree,
        stdio: "pipe",
        detached: true,
        env: { ...process.env, NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1", NODE_USE_ENV_PROXY: "0" },
      });
      serverProc.unref();
      await new Promise(r => setTimeout(r, 30_000));
    } catch { /* ignore */ }

    appendEvent(session.sessionId, { type: "RECOVERY", level: 2, action: "RESUME_CAMPAIGN" });
    return { action: "RESUME_CAMPAIGN" };
  }

  return { action: "MANUAL_REVIEW_REQUIRED" };
}

// ── Codex Writer validation ────────────────────────────

function validateCodexRepair(session, supervisorState) {
  if (!supervisorState) return null;
  const repairs = supervisorState.repairAttempts || [];
  if (repairs.length === 0) return null;

  const last = repairs[repairs.length - 1];
  const issues = [];

  if (!last.threadId) issues.push("missing threadId");
  if (!last.changedFiles || last.changedFiles.length === 0) issues.push("changedFiles=0");
  if (last.changedFiles && last.changedFiles.every(f => f.includes(".test."))) issues.push("only test files changed");

  if (issues.length > 0) {
    return { threadId: last.threadId, issues, verdict: "REPAIR_INCOMPLETE" };
  }

  return { threadId: last.threadId, changedFiles: last.changedFiles, verdict: "OK" };
}

// ── Main watchdog loop ─────────────────────────────────

let running = true;

function stop() { running = false; }

async function runWatchdog(intervalMs = 30_000) {
  console.log(`[Watchdog] Starting with ${intervalMs}ms interval`);

  while (running) {
    try {
      const session = getActiveSession();
      if (!session) {
        await new Promise(r => setTimeout(r, intervalMs));
        continue;
      }

      // 1. PID check
      const supAlive = pidAlive(session.supervisorPid);
      const srvAlive = pidAlive(session.serverPid);

      // 2. State file freshness
      const stateAge = getStateFileAge(session);

      // 3. Stall detection
      const stall = detectStall(session);

      // 4. Server health
      const serverHealthy = checkServerHealth(666);

      // Update session
      const updated = { ...session };

      // Log observation
      appendEvent(session.sessionId, {
        type: "WATCHDOG_TICK",
        supAlive,
        srvAlive,
        serverHealthy,
        stateAgeMs: stateAge,
        phase: stall.phase,
        cycle: stall.cycle,
        stalled: stall.stalled,
      });

      // Handle stall
      if (stall.stalled && stall.alertCount >= 2) {
        console.log(`[Watchdog] Stall detected in ${stall.phase} (${Math.round(stall.unchangedMs / 1000)}s)`);
        const result = await attemptRecovery(session, stall, session.worktree);
        updated.recoveryAttempts = (updated.recoveryAttempts || 0) + 1;

        if (result.action === "MANUAL_REVIEW_REQUIRED") {
          updated.state = "FAILED";
          updated.finalStatus = "MANUAL_REVIEW_REQUIRED";
          console.log("[Watchdog] MANUAL_REVIEW_REQUIRED");
          saveSession(updated);
          break;
        }
      }

      // Check session total timeout
      const totalElapsed = Date.now() - new Date(session.startedAt).getTime();
      if (totalElapsed > getDeadlines().SESSION_TOTAL) {
        updated.state = "FAILED";
        updated.finalStatus = "MANUAL_REVIEW_REQUIRED";
        saveSession(updated);
        console.log("[Watchdog] Session total timeout reached");
        break;
      }

      saveSession(updated);
    } catch (err) {
      console.error("[Watchdog] Error:", err.message);
      appendEvent(getActiveSession()?.sessionId, { type: "WATCHDOG_ERROR", error: err.message });
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  console.log("[Watchdog] Stopped");
}

// ── Export ─────────────────────────────────────────────

export {
  runWatchdog,
  stop,
  detectStall,
  attemptRecovery,
  checkServerHealth,
  validateCodexRepair,
  getDeadlines,
  pidAlive,
};
