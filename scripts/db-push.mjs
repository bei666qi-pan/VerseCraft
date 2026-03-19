#!/usr/bin/env node
import path from "node:path";
import { execSync } from "node:child_process";
import { config as dotenvConfig } from "dotenv";

// Cross-platform env loading (PowerShell doesn't support `FOO=bar cmd`).
dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
  console.error("[db:push] DATABASE_URL is missing. Check .env.local");
  process.exit(1);
}

execSync("pnpm exec drizzle-kit push --force", { stdio: "inherit" });
