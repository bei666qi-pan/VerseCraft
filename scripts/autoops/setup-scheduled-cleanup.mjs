#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  loadLocalEnvFiles,
  logJson,
  parseArgs,
  writeRuntimeJson,
} from "./lib/logger.mjs";

const TASK_NAME = "VerseCraft-AutoOps-WeeklyCleanup";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);

  if (process.platform !== "win32") {
    logJson("autoops.schedule.non_windows", {
      platform: process.platform,
      suggestion:
        "Add a cron job on the ECS instance: '0 3 * * 0 docker system prune -af && docker builder prune -af'",
    });
    return;
  }

  // Check if task already exists
  const check = spawnSync("schtasks", ["/Query", "/TN", TASK_NAME], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (check.status === 0) {
    logJson("autoops.schedule.exists", { task_name: TASK_NAME });
    await writeRuntimeJson("scheduled-cleanup.json", {
      task_name: TASK_NAME,
      status: "already_exists",
    });
    return;
  }

  const repoRoot = process.cwd();
  const command = [
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `cd '${repoRoot}'; pnpm autoops:volc:clean-disk`,
  ].join(" ");

  if (dryRun) {
    logJson("autoops.schedule.dry_run", {
      task_name: TASK_NAME,
      schedule: "weekly SUN 03:00",
      command,
    });
    await writeRuntimeJson("scheduled-cleanup.json", {
      task_name: TASK_NAME,
      status: "dry_run",
    });
    return;
  }

  const create = spawnSync(
    "schtasks",
    [
      "/Create",
      "/SC",
      "WEEKLY",
      "/D",
      "SUN",
      "/TN",
      TASK_NAME,
      "/TR",
      command,
      "/ST",
      "03:00",
      "/F",
    ],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );

  if (create.status === 0) {
    logJson("autoops.schedule.created", { task_name: TASK_NAME });
    await writeRuntimeJson("scheduled-cleanup.json", {
      task_name: TASK_NAME,
      status: "created",
    });
  } else {
    logJson("autoops.schedule.failed", {
      error: create.stderr || create.stdout,
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
