#!/usr/bin/env node
/**
 * Observer Agent — read-only diagnostic for verse -ds.
 *
 * Invoked by the watchdog when the campaign is stalled or anomalous.
 * STRICTLY read-only: no file writes, no git mutations, no process management.
 *
 * Input (via env or stdin):
 *   OBSERVER_SESSION_ID=<sessionId>
 *   OBSERVER_WORKTREE=<path>
 *   OBSERVER_PHASE=<phase>
 *   OBSERVER_STALL_MS=<ms>
 *
 * Output: structured JSON decision on stdout.
 *
 * Valid decisions:
 *   WAIT, RESTART_SERVER, RESTART_SUPERVISOR, RESUME_CAMPAIGN,
 *   STOP_INFRA_BLOCKED, STOP_REPAIR_EXHAUSTED, MANUAL_REVIEW_REQUIRED
 */

import { collectDiagnostics, SESSIONS_DIR } from "./ds-session-store.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ── Input ──────────────────────────────────────────────

function getInput() {
  return {
    sessionId: process.env.OBSERVER_SESSION_ID || null,
    worktree: process.env.OBSERVER_WORKTREE || null,
    phase: process.env.OBSERVER_PHASE || "UNKNOWN",
    stallMs: parseInt(process.env.OBSERVER_STALL_MS || "0", 10),
  };
}

// ── Data collectors ────────────────────────────────────

function getProcessTree() {
  try {
    return execSync("ps aux", { encoding: "utf-8", timeout: 3000, maxBuffer: 1024 * 1024 })
      .split("\n")
      .filter(line => line.includes("supervise") || line.includes("run.ts") || line.includes("next dev") || line.includes("codex"))
      .map(l => l.slice(0, 200))
      .slice(0, 20);
  } catch { return []; }
}

function getCampaignState(worktree) {
  if (!worktree) return null;
  try {
    const dir = join(worktree, ".runtime-data", "self-improve");
    const campaigns = readdirSync(dir).filter(d => d.startsWith("campaign-")).sort().reverse();
    if (campaigns.length === 0) return null;
    const statePath = join(dir, campaigns[0], "supervisor-state.json");
    if (!existsSync(statePath)) return null;
    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch { return null; }
}

function getLastLogLines(worktree, n = 200) {
  if (!worktree) return [];
  try {
    const logPath = join(worktree, ".runtime-data", "self-improve", "server.log");
    if (!existsSync(logPath)) return [];
    const content = readFileSync(logPath, "utf-8");
    return content.split("\n").slice(-n);
  } catch { return []; }
}

function getGitDiff(worktree) {
  if (!worktree) return "";
  try {
    return execSync("git diff --stat HEAD", { encoding: "utf-8", cwd: worktree, timeout: 5000, stdio: "pipe" }).trim();
  } catch { return ""; }
}

function getOpenHandles() {
  try {
    // lsof might not work on all systems; handle gracefully
    const result = execSync("lsof -i -P -n 2>/dev/null | grep -i node | head -20", {
      encoding: "utf-8", timeout: 10000, stdio: "pipe", shell: true,
    }).trim();
    return result ? result.split("\n") : [];
  } catch { return []; }
}

function getRecoveryHistory(sessionId) {
  if (!sessionId) return [];
  try {
    // Import dynamically handled at top level
    const eventsPath = join(SESSIONS_DIR, sessionId, "events.jsonl");
    if (!existsSync(eventsPath)) return [];
    const lines = readFileSync(eventsPath, "utf-8").trim().split("\n").filter(Boolean);
    return lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && e.type && e.type.startsWith("RECOVERY"));
  } catch { return []; }
}

// ── Decision logic ─────────────────────────────────────

function decide(input, state, processTree, recoveryHistory, lastErrors) {
  const { phase, stallMs } = input;

  // PRIORITY 1: Max recovery checks (must come before phase-specific rules)
  const recoveryCount = recoveryHistory.length;
  if (recoveryCount >= 2) {
    const samePhaseRecoveries = recoveryHistory.filter(e =>
      e.phase === phase || (e.detail && e.detail.phase === phase) ||
      (e.recoveryClass && e.recoveryClass.includes(phase))
    ).length;
    if (samePhaseRecoveries >= 2) {
      return { decision: "MANUAL_REVIEW_REQUIRED", confidence: "high", reason: `Repeated recovery failures for phase ${phase}` };
    }
  }

  // PRIORITY 2: Repair exhaustion
  if (state && state.repairAttempts && state.repairAttempts.length >= 3) {
    const allFailed = state.repairAttempts.every(r => !r.success || (r.changedFiles && r.changedFiles.length === 0));
    if (allFailed) {
      return { decision: "STOP_REPAIR_EXHAUSTED", confidence: "high", reason: "All repair attempts failed (0 changed files)" };
    }
  }

  // PRIORITY 3: Process state mismatch
  const supProcesses = processTree.filter(l => l.includes("supervise")).length;
  if (supProcesses === 0 && state && state.phase !== "MAX_CYCLES_REACHED") {
    return { decision: "RESTART_SUPERVISOR", confidence: "high", reason: "Supervisor process not found in process tree" };
  }

  // PRIORITY 4: Phase-specific stall rules
  if (phase === "SERVER_STARTING" && stallMs > 4 * 60_000) {
    return { decision: "RESTART_SERVER", confidence: "high", reason: "Server start timed out" };
  }

  if (phase === "EVAL_RUNNING" && stallMs > 30 * 60_000) {
    const recentErrors = lastErrors.filter(l => l.includes("site_fallback") || l.includes("server_internal")).length;
    if (recentErrors > 5) {
      return { decision: "STOP_INFRA_BLOCKED", confidence: "high", reason: `Persistent infrastructure failures (${recentErrors} recent site_fallback errors)` };
    }
    return { decision: "RESTART_SUPERVISOR", confidence: "medium", reason: "Eval stuck without clear model errors" };
  }

  if (phase === "CODEX_REPAIR_RUNNING" && stallMs > 20 * 60_000) {
    return { decision: "RESTART_SUPERVISOR", confidence: "high", reason: "Codex repair timed out" };
  }

  // PRIORITY 5: Default escalation
  if (stallMs < 15 * 60_000) {
    return { decision: "WAIT", confidence: "medium", reason: "Still within grace period" };
  }

  if (recoveryCount === 0) {
    return { decision: "RESTART_SERVER", confidence: "low", reason: "First stall, try server restart" };
  }

  if (recoveryCount === 1) {
    return { decision: "RESUME_CAMPAIGN", confidence: "low", reason: "Second stall, try campaign resume" };
  }

  return { decision: "MANUAL_REVIEW_REQUIRED", confidence: "medium", reason: "Exhausted automatic recovery" };
}

// ── Main ───────────────────────────────────────────────

function runObserver() {
  const input = getInput();
  const state = getCampaignState(input.worktree);
  const processTree = getProcessTree();
  const lastLogLines = getLastLogLines(input.worktree);
  const gitDiff = getGitDiff(input.worktree);
  const openHandles = getOpenHandles();
  const diagnostics = collectDiagnostics();
  const recoveryHistory = getRecoveryHistory(input.sessionId);

  const decision = decide(input, state, processTree, recoveryHistory, lastLogLines);

  // Build structured output
  const output = {
    observerVersion: "1.0.0",
    timestamp: new Date().toISOString(),
    input,
    observation: {
      stateSummary: state ? {
        campaignId: state.campaignId,
        phase: state.phase,
        cycle: state.cycle,
        maxCycles: state.maxCycles,
        strictResults: (state.strictResults || []).map(s => ({ cycle: s.cycle, status: s.status })),
        repairAttempts: (state.repairAttempts || []).length,
      } : null,
      processCount: processTree.length,
      lastErrorCount: lastLogLines.filter(l => l.includes("error") || l.includes("site_fallback")).length,
      gitDiff,
      openHandleCount: openHandles.length,
      recoveryCount: recoveryHistory.length,
    },
    diagnostics,
    decision,
    nextSteps: {
      WAIT: "Continue monitoring. No action needed.",
      RESTART_SERVER: "Watchdog should SIGTERM the managed server, wait, and restart it.",
      RESTART_SUPERVISOR: "Watchdog should terminate and restart the Supervisor process, then resume campaign.",
      RESUME_CAMPAIGN: "Watchdog should attempt to resume the campaign from its saved state.",
      STOP_INFRA_BLOCKED: "Infrastructure is persistently blocked. Stop the campaign and report.",
      STOP_REPAIR_EXHAUSTED: "Repair attempts have been exhausted. Stop the campaign.",
      MANUAL_REVIEW_REQUIRED: "Automatic recovery cannot resolve this. Human review needed.",
    }[decision.decision] || "Unknown decision",
  };

  return output;
}

// ── CLI entry ──────────────────────────────────────────

const output = runObserver();
console.log(JSON.stringify(output, null, 2));

export { runObserver, decide, getInput };
