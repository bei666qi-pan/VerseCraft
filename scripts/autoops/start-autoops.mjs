#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import {
  ensureRuntimeDir,
  loadLocalEnvFiles,
  logJson,
  parseArgs,
  warnJson,
} from "./lib/logger.mjs";
import { pollHealth, attemptRemediation } from "./lib/health-poller.mjs";

const POLL_INTERVAL_MS = 300000; // 5 min
const HEALTH_INTERVAL_MS = 300000; // 5 min
const CONSECUTIVE_FAIL_LIMIT = 3;
const LOOP_TICK_MS = 30000; // 30s between cycle iterations

// ── Bootstrap ─────────────────────────────────────────────────

async function runSelfTest(args) {
  if (args.noTest) {
    logJson("autoops.start.self_test_skipped", {});
    return true;
  }
  logJson("autoops.start.self_test", {});
  try {
    execSync("node scripts/autoops/self-test.mjs", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });
    logJson("autoops.start.self_test.ok", {});
    return true;
  } catch (error) {
    const msg = error.stderr || error.stdout || error.message || "unknown";
    logJson("autoops.start.self_test.failed", {
      error: String(msg).slice(0, 300),
    });
    if (!args.force) {
      throw new Error("Self-test failed. Use --force to bypass.");
    }
    return false;
  }
}

async function discoverAndLog(args) {
  if (!args.discover) {
    logJson("autoops.start.discover_skipped", {
      reason: "use --discover to run",
    });
    return;
  }
  try {
    execSync("node scripts/autoops/discover.mjs", {
      encoding: "utf8",
      stdio: "inherit",
      timeout: 30000,
    });
  } catch (error) {
    warnJson("autoops.start.discover_failed", {
      error: error.message?.slice(0, 300),
    });
  }
}

async function conditionalSetup(args) {
  // Schedule weekly cleanup (Windows only)
  if (process.platform === "win32" && !args.noSchedule) {
    try {
      const result = spawnSync(
        "node",
        [
          "scripts/autoops/setup-scheduled-cleanup.mjs",
          ...(args.dryRun ? ["--dry-run"] : []),
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }
      );
      if (result.status !== 0) {
        logJson("autoops.start.schedule_warning", {
          error: (result.stderr || result.stdout || "").slice(0, 300),
        });
      }
    } catch (error) {
      logJson("autoops.start.schedule_warning", {
        error: error.message?.slice(0, 200),
      });
    }
  }

  // Setup CloudMonitor disk alert (manual steps only)
  if (args.setupDiskAlert) {
    try {
      spawnSync(
        "node",
        [
          "scripts/autoops/setup-disk-alert.mjs",
          ...(args.dryRun ? ["--dry-run"] : []),
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }
      );
    } catch (error) {
      logJson("autoops.start.disk_alert_warning", {
        error: error.message?.slice(0, 200),
      });
    }
  }
}

// ── Incident processing ───────────────────────────────────────

async function pollIncident(args) {
  try {
    const { once } = await import("./local-codex-runner.mjs");
    return once(args);
  } catch (error) {
    warnJson("autoops.incident.poll_error", {
      error: error.message?.slice(0, 300),
    });
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  await ensureRuntimeDir();

  const agentType = args.agent || "claude";
  const pollIntervalMs = Number(args.intervalMs || POLL_INTERVAL_MS);
  const healthIntervalMs = Number(args.healthIntervalMs || HEALTH_INTERVAL_MS);

  logJson("autoops.start.begin", {
    agent: agentType,
    poll_interval_ms: pollIntervalMs,
    health_interval_ms: healthIntervalMs,
    dry_run: Boolean(args.dryRun),
  });

  // Phase 1: Bootstrap
  await runSelfTest(args);
  await discoverAndLog(args);

  // Phase 2: One-time setup
  await conditionalSetup(args);

  // Phase 3: Main polling loop
  let lastHealthPoll = 0;
  let lastIncidentPoll = 0;
  let consecutiveHealthFailures = 0;

  logJson("autoops.start.started", {
    message: "进入主轮询循环。按 Ctrl+C 停止。",
  });

  process.on("SIGINT", () => {
    logJson("autoops.start.shutdown", { signal: "SIGINT" });
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    logJson("autoops.start.shutdown", { signal: "SIGTERM" });
    process.exit(0);
  });

  do {
    const now = Date.now();

    // ── Health check ──
    if (now - lastHealthPoll >= healthIntervalMs) {
      try {
        const health = await pollHealth();
        lastHealthPoll = now;

        if (!health.ok) {
          consecutiveHealthFailures += 1;
          logJson("autoops.health.check_failed", {
            consecutive_failures: consecutiveHealthFailures,
            limit: CONSECUTIVE_FAIL_LIMIT,
          });

          if (consecutiveHealthFailures >= CONSECUTIVE_FAIL_LIMIT) {
            logJson("autoops.health.remediation_triggered", {
              failures: consecutiveHealthFailures,
            });
            await attemptRemediation({ dryRun: Boolean(args.dryRun) });
            consecutiveHealthFailures = 0;
          }
        } else {
          consecutiveHealthFailures = 0;
        }
      } catch (error) {
        warnJson("autoops.health.poll_cycle_error", {
          error: error.message?.slice(0, 300),
        });
      }
    }

    // ── Incident polling ──
    if (now - lastIncidentPoll >= pollIntervalMs) {
      try {
        const result = await pollIncident(args);
        if (result?.manual) {
          logJson("autoops.incident.manual_intervention_needed", {
            issue: result.issue || "unknown",
          });
        }
      } catch (error) {
        warnJson("autoops.incident.poll_cycle_error", {
          error: error.message?.slice(0, 300),
        });
      }
      lastIncidentPoll = now;
    }

    await new Promise((resolve) => setTimeout(resolve, LOOP_TICK_MS));
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
