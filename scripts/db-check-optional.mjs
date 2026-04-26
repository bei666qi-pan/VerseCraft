#!/usr/bin/env node
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import { execSync } from "node:child_process";

// Optional DB check for CI/dev: skip when DATABASE_URL absent.
dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
  console.log("[db:check:optional] DATABASE_URL missing; skipping.");
  process.exit(0);
}

try {
  const output = execSync("node ./scripts/db-check.mjs", { encoding: "utf8", stdio: "pipe" });
  if (output) process.stdout.write(output);
} catch (err) {
  const output = `${err?.stdout ?? ""}${err?.stderr ?? ""}${err?.message ?? ""}`;
  if (/\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH)\b/i.test(output)) {
    console.warn("[db:check:optional] PostgreSQL unavailable; skipping optional DB check.");
    process.exit(0);
  }
  if (err?.stdout) process.stdout.write(String(err.stdout));
  if (err?.stderr) process.stderr.write(String(err.stderr));
  console.warn("[db:check:optional] DB check failed; skipping (optional).");
  process.exit(0);
}

