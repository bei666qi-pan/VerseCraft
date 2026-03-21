// src/lib/config/loadVerseCraftEnv.ts
/**
 * Ensures Next.js env files (`.env`, `.env.local`, …) are merged into `process.env`
 * using the real app root — not whatever `process.cwd()` happens to be when the
 * process was spawned (subfolder starts, PM2, IDEs, etc.).
 */
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

let versecraftEnvLoaded = false;

export function resolveVerseCraftProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = fs.readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === "versecraft") return dir;
      } catch {
        /* ignore malformed package.json */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Idempotent; safe to call from instrumentation and from `/api/chat` before reading AI keys. */
export function loadVerseCraftEnvFilesOnce(): void {
  if (versecraftEnvLoaded) return;
  versecraftEnvLoaded = true;
  if (process.env.NEXT_RUNTIME === "edge") return;
  const root = resolveVerseCraftProjectRoot();
  loadEnvConfig(root);
}
