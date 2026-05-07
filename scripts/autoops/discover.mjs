#!/usr/bin/env node
import { discoverCoolifyAppUuid } from "./lib/coolify.mjs";
import { discoverVolcInstances } from "./lib/volc-openapi.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

async function runStep(name, fn) {
  try {
    return { name, ok: true, result: await fn() };
  } catch (error) {
    return { name, ok: false, error: error.message };
  }
}

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const steps = [
    await runStep("coolify", () => discoverCoolifyAppUuid({ dryRun })),
    await runStep("volcengine", () => discoverVolcInstances({ dryRun })),
  ];
  const report = {
    discovered_at: new Date().toISOString(),
    steps,
    missing_inputs: [
      "COOLIFY_API_KEY",
      "COOLIFY_BASE_URL",
      "VOLC_AK",
      "VOLC_SK",
      "VOLC_REGION",
    ].filter((name) => !process.env[name]),
  };
  await writeRuntimeJson("discovery-report.json", report);
  logJson("autoops.discovery.completed", report);
  if (steps.some((step) => !step.ok || step.result?.confidence === "low") && !dryRun) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
