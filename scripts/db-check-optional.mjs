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

execSync("node ./scripts/db-check.mjs", { stdio: "inherit" });

