#!/usr/bin/env node
import { discoverCoolifyAppUuid } from "./lib/coolify.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const result = await discoverCoolifyAppUuid({ dryRun: Boolean(args.dryRun) });
  await writeRuntimeJson("coolify-discovery.json", result);
  logJson("coolify.discovery.completed", result);
  if (!result.uuid && !args.dryRun) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
