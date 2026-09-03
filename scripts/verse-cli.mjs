#!/usr/bin/env node
/**
 * verse — VerseCraft CLI
 *
 * Usage:
 *   verse -ds                 Start or attach to self-improving campaign
 *   verse -ds status          Show current session status
 *   verse -ds logs            Attach to real-time logs
 *   verse -ds stop            Gracefully stop current session
 *   verse -ds resume          Resume last stoppable session
 *   verse -ds list            List all sessions
 *   verse -ds doctor          Run system diagnostics
 *   verse --version           Show version
 *
 *   Aliases:
 *     --deep-self-improve     Same as -ds
 */

import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = "1.0.0";

// Dynamic import to avoid top-level dependency issues
let sessionStore, dashboard, daemon;

async function loadModule(name) {
  const modPath = resolve(__dirname, "self-improve", `${name}.mjs`);
  return await import(modPath);
}

// ── Helpers ────────────────────────────────────────────

function printHelp() {
  console.log(`
${"\x1b[1m\x1b[36m"}verse${"\x1b[0m"} — VerseCraft Self-Improving CLI v${VERSION}

${"\x1b[1m"}USAGE:${"\x1b[0m"}
  verse -ds                     Start or attach to self-improving campaign
  verse -ds status              Show current session status (one-shot)
  verse -ds logs                View real-time campaign logs (Ctrl+C to detach)
  verse -ds stop                Gracefully stop current campaign session
  verse -ds resume              Resume the most recent stopped session
  verse -ds list                List all historical sessions
  verse -ds doctor              Run system diagnostics
  verse --version               Show version

${"\x1b[1m"}EXAMPLES:${"\x1b[0m"}
  verse -ds                     # Start a new campaign or attach to running one
  verse -ds status              # Quick status check
  verse -ds logs                # Watch live logs
  verse -ds stop                # Stop gracefully (saves progress)
  verse -ds doctor              # Check system readiness

${"\x1b[1m"}ENVIRONMENT:${"\x1b[0m"}
  VERSECRAFT_REPO               Path to VerseCraft repo (default: ~/Desktop/VerseCraft)
  SELF_IMPROVE_CODEX_BIN        Path to Codex binary
  SI_MAX_LIVE_CALLS             Max model calls (default: 400)
  VERSECRAFT_DS_DEADLINES       JSON deadline overrides
`);
}

function printVersion() {
  console.log(`verse CLI v${VERSION}`);
  try {
    const codexVer = execSync(`"${process.env.SELF_IMPROVE_CODEX_BIN || "/Applications/ChatGPT.app/Contents/Resources/codex"}" --version 2>/dev/null`, { encoding: "utf-8", timeout: 5000, stdio: "pipe" }).trim();
    console.log(`Codex: ${codexVer}`);
  } catch { /* ignore */ }
}

// ── Command implementations ────────────────────────────

async function cmdStatus() {
  sessionStore = sessionStore || await loadModule("ds-session-store");
  dashboard = dashboard || await loadModule("ds-dashboard");

  const session = sessionStore.getActiveSession();
  if (!session) {
    console.log("No active session. Run \x1b[1mverse -ds\x1b[0m to start.");
    return;
  }
  dashboard.printStatus();
}

async function cmdLogs() {
  sessionStore = sessionStore || await loadModule("ds-session-store");
  const session = sessionStore.getActiveSession();
  if (!session || !session.worktree) {
    console.log("No active session with a worktree.");
    return;
  }

  const logPath = join(session.worktree, ".runtime-data", "self-improve", "server.log");
  if (!existsSync(logPath)) {
    console.log("No server log found yet.");
    return;
  }

  console.log(`Tailing ${logPath} (Ctrl+C to detach)...\n`);

  const tail = spawn("tail", ["-f", logPath], { stdio: ["ignore", "inherit", "inherit"] });

  process.on("SIGINT", () => {
    tail.kill("SIGTERM");
    console.log("\n\x1b[2mDetached. Campaign continues. Use \x1b[1mverse -ds\x1b[0m\x1b[2m to re-attach.\x1b[0m");
    process.exit(0);
  });

  await new Promise((resolve) => {
    tail.on("exit", resolve);
  });
}

async function cmdStop() {
  sessionStore = sessionStore || await loadModule("ds-session-store");
  daemon = daemon || await loadModule("ds-daemon");

  const stoppable = sessionStore.getLatestStoppableSession();
  if (!stoppable) {
    console.log("No running session to stop.");
    return;
  }

  console.log(`Stopping session ${stoppable.sessionId}...`);
  await daemon.stopDaemon();
  console.log("Stopped. Use \x1b[1mverse -ds resume\x1b[0m to continue later.");
}

async function cmdResume() {
  sessionStore = sessionStore || await loadModule("ds-session-store");
  const resumable = sessionStore.getLatestResumableSession();
  if (!resumable) {
    console.log("No stopped session to resume. Use \x1b[1mverse -ds\x1b[0m to start a new one.");
    return;
  }

  console.log(`Resuming session ${resumable.sessionId}...`);
  console.log("Resume not yet fully implemented — starting new campaign instead.");
  await cmdStart();
}

async function cmdList() {
  sessionStore = sessionStore || await loadModule("ds-session-store");
  const sessions = sessionStore.listSessions();

  if (sessions.length === 0) {
    console.log("No sessions found.");
    return;
  }

  console.log(`\n${"\x1b[1m"}Sessions:${"\x1b[0m"}\n`);
  for (const s of sessions) {
    const stateColor = s.state === "RUNNING" ? "\x1b[32m" : s.state === "FAILED" ? "\x1b[31m" : "\x1b[33m";
    console.log(`  ${s.sessionId}`);
    console.log(`    State: ${stateColor}${s.state}${"\x1b[0m"} | Started: ${s.startedAt?.slice(0, 19) || "--"}`);
    if (s.campaignId) console.log(`    Campaign: ${s.campaignId}`);
    if (s.finalStatus) console.log(`    Final: ${s.finalStatus}`);
    console.log();
  }
}

async function cmdDoctor() {
  console.log(`${"\x1b[1m\x1b[36m"}verse -ds Doctor${"\x1b[0m"}\n`);

  const checks = [];

  // Repo
  const repo = process.env.VERSECRAFT_REPO || "/Users/qi/Desktop/VerseCraft";
  checks.push({ name: "Repo", status: existsSync(repo) ? "OK" : "MISSING", detail: repo });

  // Git
  try {
    const gitVer = execSync("git --version", { encoding: "utf-8", timeout: 5000, stdio: "pipe" }).trim();
    checks.push({ name: "Git", status: "OK", detail: gitVer });
  } catch {
    checks.push({ name: "Git", status: "MISSING", detail: "git not found" });
  }

  // Node
  checks.push({ name: "Node", status: "OK", detail: process.version });

  // pnpm
  try {
    const pnpmVer = execSync("pnpm --version", { encoding: "utf-8", timeout: 5000, stdio: "pipe" }).trim();
    checks.push({ name: "pnpm", status: "OK", detail: pnpmVer });
  } catch {
    checks.push({ name: "pnpm", status: "MISSING", detail: "pnpm not found" });
  }

  // Codex
  const codexBin = process.env.SELF_IMPROVE_CODEX_BIN || "/Applications/ChatGPT.app/Contents/Resources/codex";
  if (existsSync(codexBin)) {
    try {
      const codexVer = execSync(`"${codexBin}" --version`, { encoding: "utf-8", timeout: 5000, stdio: "pipe" }).trim();
      checks.push({ name: "Codex", status: "OK", detail: `${codexBin} (${codexVer})` });
    } catch {
      checks.push({ name: "Codex", status: "BROKEN", detail: "binary exists but --version failed" });
    }
  } else {
    checks.push({ name: "Codex", status: "MISSING", detail: codexBin });
  }

  // Env
  const envLocal = join(repo, ".env.local");
  checks.push({ name: ".env.local", status: existsSync(envLocal) ? "OK" : "MISSING", detail: envLocal });

  // Gateway
  try {
    execSync(`cd "${repo}" && pnpm probe:ai-gateway -- --role main --prompt-profile small --runs 1 --warmup-runs 0 --timeout-ms 30000 2>&1 | tail -5`, {
      encoding: "utf-8", timeout: 60000, stdio: "pipe",
      env: { ...process.env, NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1", NODE_USE_ENV_PROXY: "0" }
    });
    checks.push({ name: "Gateway", status: "OK", detail: "probe succeeded" });
  } catch {
    checks.push({ name: "Gateway", status: "FAIL", detail: "probe failed (may be network issue)" });
  }

  // PATH
  const localBin = join(process.env.HOME || "/Users/qi", ".local", "bin");
  checks.push({ name: "~/.local/bin", status: existsSync(localBin) ? "OK" : "MISSING", detail: localBin });

  const inPath = (process.env.PATH || "").includes(localBin);
  checks.push({ name: "~/.local/bin in PATH", status: inPath ? "OK" : "MISSING", detail: inPath ? "yes" : "not in PATH" });

  // Session store
  sessionStore = sessionStore || await loadModule("ds-session-store");
  const diag = sessionStore.collectDiagnostics();
  checks.push({ name: "Session Store", status: "OK", detail: `${diag.sessionsCount} sessions` });

  // Print
  for (const c of checks) {
    const icon = c.status === "OK" ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${icon} ${c.name}: ${c.status === "OK" ? "\x1b[32m" : "\x1b[31m"}${c.status}\x1b[0m${c.detail ? ` — ${c.detail}` : ""}`);
  }

  const allOk = checks.every(c => c.status === "OK");
  console.log(`\n${allOk ? "\x1b[32mAll checks passed.\x1b[0m" : "\x1b[31mSome checks failed.\x1b[0m"}`);
}

async function cmdStart() {
  sessionStore = sessionStore || await loadModule("ds-session-store");
  dashboard = dashboard || await loadModule("ds-dashboard");
  daemon = daemon || await loadModule("ds-daemon");

  // Check for existing active session
  let session = sessionStore.getActiveSession();
  if (session && (session.state === "RUNNING" || session.state === "STARTING")) {
    console.log(`Attaching to existing session: ${session.sessionId}`);
    await dashboard.runDashboard();
    return;
  }

  // Check lock
  if (sessionStore.isLockHeld()) {
    console.log("Another daemon instance is running. Attaching...");
    await dashboard.runDashboard();
    return;
  }

  // Acquire lock
  if (!sessionStore.acquireLock()) {
    console.log("Could not acquire daemon lock. Another instance may be running.");
    return;
  }

  // Start daemon
  session = await daemon.startDaemon();

  if (session && session.state === "RUNNING") {
    // Show dashboard
    await dashboard.runDashboard();
  } else if (session && session.finalStatus) {
    console.log(`\nCampaign ended: ${session.finalStatus}`);
  }

  // Release lock on exit
  sessionStore.releaseLock();
}

// ── Main ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --version
  if (args.includes("--version") || args.includes("-v") || args.includes("-V")) {
    printVersion();
    return;
  }

  // -ds or --deep-self-improve
  const isDs = args.includes("-ds") || args.includes("--deep-self-improve");

  if (!isDs) {
    // Check for unknown flags
    if (args.length > 0) {
      console.log(`Unknown command. Use ${"\x1b[1m"}verse -ds${"\x1b[0m"} or ${"\x1b[1m"}verse --help${"\x1b[0m"}.`);
    } else {
      printHelp();
    }
    return;
  }

  // Remove -ds/--deep-self-improve from args
  const subArgs = args.filter(a => a !== "-ds" && a !== "--deep-self-improve");
  const subcommand = subArgs[0] || "start";

  switch (subcommand) {
    case "status":
      await cmdStatus();
      break;
    case "logs":
      await cmdLogs();
      break;
    case "stop":
      await cmdStop();
      break;
    case "resume":
      await cmdResume();
      break;
    case "list":
      await cmdList();
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "start":
    default:
      await cmdStart();
      break;
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
