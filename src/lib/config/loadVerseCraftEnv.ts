// src/lib/config/loadVerseCraftEnv.ts
/**
 * Ensures Next.js env files (`.env`, `.env.local`, …) are merged into `process.env`
 * using the real app root — not whatever `process.cwd()` happens to be when the
 * process was spawned (subfolder starts, PM2, IDEs, etc.).
 *
 * Also re-reads `.env` / `.env.local` for **AI gateway** secrets and assigns them to
 * `process.env`, so local dev is not blocked when `@next/env` + bundler omit keys.
 */
import "server-only";

import fs from "node:fs";
import path from "node:path";
type LoadEnvConfigFn = (dir: string) => void;

function loadEnvConfigSync(root: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@next/env") as { loadEnvConfig: LoadEnvConfigFn };
    mod.loadEnvConfig(root);
  } catch {
    /* @next/env unavailable at build time; rely on Next.js built-in env loading */
  }
}

/** Env names used by `envCore.resolveAiEnv` / `anyAiProviderConfigured`. */
const AI_SECRET_ENV_NAMES = [
  "AI_GATEWAY_BASE_URL",
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_PROVIDER",
  "AI_MODEL_MAIN",
  "AI_MODEL_CONTROL",
  "AI_MODEL_ENHANCE",
  "AI_MODEL_REASONER",
  "AI_PLAYER_ROLE_CHAIN",
  "AI_PLAYER_MODEL_CHAIN",
  "AI_MEMORY_PRIMARY_ROLE",
  "AI_MEMORY_MODEL",
  "AI_DEV_ASSIST_PRIMARY_ROLE",
  "AI_ADMIN_MODEL",
  "AI_REQUEST_TIMEOUT_MS",
  "AI_TIMEOUT_MS",
  "AI_ENABLE_STREAM",
  "AI_LOG_LEVEL",
] as const;

function stripBom(s: string): string {
  if (s.length > 0 && s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

/** Minimal dotenv line parse (single-line values; typical for API keys). */
function parseDotenvFileBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = stripBom(body);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function applyAiSecretsFromParsedEnv(parsed: Record<string, string>): void {
  for (const name of AI_SECRET_ENV_NAMES) {
    const v = parsed[name];
    if (typeof v === "string" && v.trim().length > 0) {
      process.env[name] = v.trim();
    }
  }
}

/** Read `.env` then `.env.local` from disk and push allowlisted AI keys into `process.env`. */
export function mergeAiSecretsFromProjectEnvFiles(root: string): void {
  const merged: Record<string, string> = {};
  for (const base of [".env", ".env.local"]) {
    const abs = path.join(root, base);
    if (!fs.existsSync(abs)) continue;
    try {
      const raw = fs.readFileSync(abs, "utf8");
      Object.assign(merged, parseDotenvFileBody(raw));
    } catch {
      /* ignore unreadable env file */
    }
  }
  applyAiSecretsFromParsedEnv(merged);
}

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
  if (process.env.NEXT_RUNTIME === "edge") return;
  const root = resolveVerseCraftProjectRoot();
  loadEnvConfigSync(root);
  mergeAiSecretsFromProjectEnvFiles(root);
  versecraftEnvLoaded = true;
}

/**
 * Always re-merge `.env` / `.env.local` from the resolved project root (no "loaded" short-circuit).
 * Use when keys still appear missing after `loadVerseCraftEnvFilesOnce` — e.g. first tick ordering in dev.
 */
export function reloadVerseCraftProcessEnv(): void {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const root = resolveVerseCraftProjectRoot();
  loadEnvConfigSync(root);
  mergeAiSecretsFromProjectEnvFiles(root);
}
