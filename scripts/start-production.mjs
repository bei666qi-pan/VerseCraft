#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function log(event, extra = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...extra }));
}

function envFlag(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  return !/^(0|false|off|no)$/i.test(raw.trim());
}

function spawnChild(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: options.env ?? process.env,
  });
  children.add(child);
  log("process_started", { name, pid: child.pid });

  child.on("exit", (code, signal) => {
    children.delete(child);
    log("process_exited", { name, code, signal });
    if (shuttingDown) return;

    if (name === "worker" && !envFlag("VC_EMBEDDED_WORKER_REQUIRED", true) && code === 0) {
      return;
    }

    shutdown(code === 0 || code == null ? 1 : code);
  });

  child.on("error", (error) => {
    children.delete(child);
    log("process_error", { name, message: error.message });
    if (!shuttingDown) shutdown(1);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutdown_started", { exitCode });
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 8000).unref();
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

if (envFlag("MIGRATE_ON_BOOT", true)) {
  log("migration_started");
  const migration = spawnSync(process.execPath, ["scripts/migrate.js"], {
    stdio: "inherit",
    env: process.env,
  });
  if (migration.status !== 0) {
    log("migration_failed", { status: migration.status, signal: migration.signal });
    process.exit(migration.status ?? 1);
  }
  log("migration_completed");
}

const workerEnabled =
  envFlag("VC_RUN_EMBEDDED_WORKER", true) &&
  envFlag("VC_KG_ENABLED", true) &&
  envFlag("AI_ENABLE_WORLD_DIRECTOR", true);

if (workerEnabled) {
  const workerEnv = {
    ...process.env,
    VC_WORKER_CONCURRENCY: process.env.VC_WORKER_CONCURRENCY || "1",
  };
  spawnChild("worker", process.execPath, [
    "--conditions=react-server",
    "--import",
    "tsx",
    "scripts/vc-worker.ts",
  ], { env: workerEnv });
} else {
  log("worker_disabled", {
    VC_RUN_EMBEDDED_WORKER: process.env.VC_RUN_EMBEDDED_WORKER ?? "",
    VC_KG_ENABLED: process.env.VC_KG_ENABLED ?? "",
    AI_ENABLE_WORLD_DIRECTOR: process.env.AI_ENABLE_WORLD_DIRECTOR ?? "",
  });
}

spawnChild("web", process.execPath, ["server.js"]);
