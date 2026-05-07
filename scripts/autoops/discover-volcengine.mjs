#!/usr/bin/env node
import { discoverVolcInstances } from "./lib/volc-openapi.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const result = await discoverVolcInstances({ dryRun: Boolean(args.dryRun) });
  await writeRuntimeJson("discovery-report.json", result);
  logJson("volc.discovery.completed", result);
  if (!result.instanceIds?.length && !args.dryRun) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
