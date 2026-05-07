#!/usr/bin/env node
import { runHealthcheck } from "./lib/healthcheck.mjs";
import { loadLocalEnvFiles, parseArgs } from "./lib/logger.mjs";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const result = await runHealthcheck({
    siteUrl: args.siteUrl || process.env.AUTOOPS_SITE_URL,
    healthUrl: args.healthUrl || process.env.AUTOOPS_HEALTH_URL,
    attempts: Number(args.attempts || 3),
    timeoutMs: Number(args.timeoutMs || 8000),
    smoke: args.smoke !== "false",
    dryRun: Boolean(args.dryRun),
  });
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
