#!/usr/bin/env node
/**
 * Real-time dashboard for verse -ds.
 *
 * Displays compact live status. Ctrl+C detaches without killing the daemon.
 * Reads from session store + campaign state files.
 */

import { getActiveSession } from "./ds-session-store.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Terminal helpers ───────────────────────────────────

const CLEAR = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function colorForStatus(status) {
  if (!status) return DIM;
  if (status.includes("PASS") || status === "STRICT_PASS") return GREEN;
  if (status.includes("FAIL") || status.includes("BLOCKED") || status.includes("EXHAUSTED")) return RED;
  if (status.includes("RUNNING") || status.includes("STARTED")) return CYAN;
  return YELLOW;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "--";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function truncate(str, max) {
  if (!str) return "--";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

// ── Data loading ───────────────────────────────────────

function loadSupervisorState(worktree) {
  if (!worktree) return null;
  try {
    // Find the campaign state file
    const runtimeDir = join(worktree, ".runtime-data", "self-improve");
    if (!existsSync(runtimeDir)) return null;

    const dirs = readdirSync(runtimeDir).filter(d => d.startsWith("campaign-"));
    if (dirs.length === 0) return null;

    // Get the latest campaign
    const latest = dirs.sort().reverse()[0];
    const statePath = join(runtimeDir, latest, "supervisor-state.json");
    if (!existsSync(statePath)) return null;

    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch { return null; }
}

function loadCurrentEvalResults(worktree) {
  if (!worktree) return null;
  try {
    const runtimeDir = join(worktree, ".runtime-data", "self-improve");
    if (!existsSync(runtimeDir)) return null;

    const dirs = readdirSync(runtimeDir).filter(d => d.startsWith("si-"));
    if (dirs.length === 0) return null;

    const latest = dirs.sort().reverse()[0];
    const resultsPath = join(runtimeDir, latest, "deterministic-results.json");
    if (!existsSync(resultsPath)) return null;

    const results = JSON.parse(readFileSync(resultsPath, "utf-8"));
    const cases = Array.isArray(results) ? results : (results.cases || results.results || []);
    const passed = cases.filter(c => c.passed === true).length;
    const failed = cases.filter(c => c.passed === false).length;
    const infra = cases.filter(c => c.errorClass === "infrastructure_failure").length;
    return { total: cases.length, passed, failed, infra, runId: latest };
  } catch { return null; }
}

function loadHoldoutResults(worktree) {
  if (!worktree) return null;
  try {
    const runtimeDir = join(worktree, ".runtime-data", "self-improve");
    if (!existsSync(runtimeDir)) return null;

    const dirs = readdirSync(runtimeDir).filter(d => d.startsWith("si-"));
    if (dirs.length === 0) return null;

    const latest = dirs.sort().reverse()[0];
    const holdoutPath = join(runtimeDir, latest, "holdout-results.json");
    if (!existsSync(holdoutPath)) return null;

    const results = JSON.parse(readFileSync(holdoutPath, "utf-8"));
    const cases = Array.isArray(results) ? results : (results.cases || results.results || []);
    const valid = cases.filter(c => c.errorClass !== "infrastructure_failure").length;
    const passed = cases.filter(c => c.passed === true).length;
    const total = cases.length;
    return { total, valid, passed };
  } catch { return null; }
}

// ── Render ─────────────────────────────────────────────

function renderDashboard(session, supervisorState, evalResults, holdoutResults) {
  const lines = [];

  lines.push(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}`);
  lines.push(`${BOLD}${CYAN}║${RESET}  ${BOLD}VerseCraft Self-Improving Campaign${RESET}                        ${BOLD}${CYAN}║${RESET}`);
  lines.push(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}`);
  lines.push("");

  if (!session) {
    lines.push(`  ${YELLOW}No active session. Run ${BOLD}verse -ds${RESET}${YELLOW} to start.${RESET}`);
    return lines;
  }

  const elapsed = session.startedAt ? formatDuration(Date.now() - new Date(session.startedAt).getTime()) : "--";
  const stateColor = colorForStatus(session.state);

  // Session info
  lines.push(`  ${BOLD}Session:${RESET}     ${session.sessionId}`);
  lines.push(`  ${BOLD}State:${RESET}       ${stateColor}${session.state}${RESET}`);
  lines.push(`  ${BOLD}Elapsed:${RESET}     ${elapsed}`);
  if (session.campaignId) lines.push(`  ${BOLD}Campaign:${RESET}    ${session.campaignId}`);
  if (session.branch) lines.push(`  ${BOLD}Branch:${RESET}      ${truncate(session.branch, 45)}`);
  if (session.worktree) lines.push(`  ${BOLD}Worktree:${RESET}    ${truncate(session.worktree, 40)}`);

  lines.push("");

  // Supervisor state
  if (supervisorState) {
    const phaseColor = colorForStatus(supervisorState.phase);
    lines.push(`  ${BOLD}─ Supervisor ─────────────────────────────────────────${RESET}`);
    lines.push(`  ${BOLD}Phase:${RESET}       ${phaseColor}${supervisorState.phase || "--"}${RESET}`);
    lines.push(`  ${BOLD}Cycle:${RESET}       ${supervisorState.cycle || 0} / ${supervisorState.maxCycles || "--"}`);

    const strictResults = supervisorState.strictResults || [];
    if (strictResults.length > 0) {
      const last = strictResults[strictResults.length - 1];
      const sc = colorForStatus(last.status);
      lines.push(`  ${BOLD}Strict:${RESET}      ${sc}${last.status || "--"}${RESET} (cycle ${last.cycle})`);
    }

    const repairs = supervisorState.repairAttempts || [];
    const lastRepair = repairs[repairs.length - 1];
    if (lastRepair) {
      lines.push(`  ${BOLD}Last Repair:${RESET} ${lastRepair.success ? GREEN + "OK" : RED + "FAIL"}${RESET} | changedFiles=${(lastRepair.changedFiles || []).length} | threadId=${truncate(lastRepair.threadId || "--", 20)}`);
    }
    lines.push(`  ${BOLD}Recoveries:${RESET}   ${session.recoveryAttempts || 0}`);
  }

  lines.push("");

  // Eval results
  if (evalResults) {
    lines.push(`  ${BOLD}─ Current Eval ────────────────────────────────────────${RESET}`);
    lines.push(`  ${BOLD}Run:${RESET}         ${evalResults.runId}`);
    lines.push(`  ${BOLD}Coverage:${RESET}    ${evalResults.total - evalResults.infra} / ${evalResults.total} valid (${evalResults.infra} infra)`);
    const passColor = evalResults.failed === 0 ? GREEN : RED;
    lines.push(`  ${BOLD}Passed:${RESET}      ${evalResults.passed} | ${BOLD}Failed:${RESET} ${passColor}${evalResults.failed}${RESET}`);
  }

  lines.push("");

  // Holdout
  if (holdoutResults) {
    const hoColor = holdoutResults.passed === holdoutResults.total ? GREEN : RED;
    lines.push(`  ${BOLD}─ Holdout ────────────────────────────────────────────${RESET}`);
    lines.push(`  ${BOLD}Valid:${RESET}       ${holdoutResults.valid} / ${holdoutResults.total}`);
    lines.push(`  ${BOLD}Passed:${RESET}      ${hoColor}${holdoutResults.passed} / ${holdoutResults.total}${RESET}`);
    lines.push("");
  }

  // Health
  if (session.supervisorPid) {
    let supAlive = false;
    try { process.kill(session.supervisorPid, 0); supAlive = true; } catch { /* dead */ }
    lines.push(`  ${BOLD}─ Health ─────────────────────────────────────────────${RESET}`);
    lines.push(`  ${BOLD}Supervisor:${RESET}  PID ${session.supervisorPid} ${supAlive ? GREEN + "ALIVE" : RED + "DEAD"}${RESET}`);
    if (session.serverPid) {
      let srvAlive = false;
      try { process.kill(session.serverPid, 0); srvAlive = true; } catch { /* dead */ }
      lines.push(`  ${BOLD}Server:${RESET}      PID ${session.serverPid} ${srvAlive ? GREEN + "ALIVE" : RED + "DEAD"}${RESET}`);
    }
  }

  // Final status
  if (session.finalStatus) {
    const fc = colorForStatus(session.finalStatus);
    lines.push("");
    lines.push(`  ${BOLD}${fc}Final: ${session.finalStatus}${RESET}`);
  }

  lines.push("");
  lines.push(`  ${DIM}Ctrl+C to detach (campaign continues in background)${RESET}`);

  return lines;
}

// ── Live mode ──────────────────────────────────────────

async function runDashboard(intervalMs = 5000) {
  let running = true;

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    running = false;
  });

  // Hide cursor on exit
  process.on("exit", () => {
    process.stdout.write(SHOW_CURSOR);
  });

  process.stdout.write(HIDE_CURSOR);

  while (running) {
    const session = getActiveSession();
    const supervisorState = loadSupervisorState(session?.worktree);
    const evalResults = loadCurrentEvalResults(session?.worktree);
    const holdoutResults = loadHoldoutResults(session?.worktree);

    const lines = renderDashboard(session, supervisorState, evalResults, holdoutResults);

    process.stdout.write(CLEAR);
    process.stdout.write(lines.join("\n") + "\n");

    if (!running) break;

    // Wait
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  process.stdout.write(SHOW_CURSOR);
  console.log(`\n${DIM}Detached. Campaign continues in background. Use ${BOLD}verse -ds${RESET}${DIM} to re-attach.${RESET}`);
}

// ── One-shot status ────────────────────────────────────

function printStatus() {
  const session = getActiveSession();
  const supervisorState = loadSupervisorState(session?.worktree);
  const evalResults = loadCurrentEvalResults(session?.worktree);
  const holdoutResults = loadHoldoutResults(session?.worktree);

  const lines = renderDashboard(session, supervisorState, evalResults, holdoutResults);
  console.log(lines.join("\n"));
}

// ── Export ─────────────────────────────────────────────

export { renderDashboard, runDashboard, printStatus, loadSupervisorState, loadCurrentEvalResults, loadHoldoutResults };
