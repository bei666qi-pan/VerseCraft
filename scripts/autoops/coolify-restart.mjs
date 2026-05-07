#!/usr/bin/env node
import { CoolifyClient, discoverCoolifyAppUuid } from "./lib/coolify.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const uuid = args.uuid || process.env.COOLIFY_APP_UUID || (await discoverCoolifyAppUuid({ dryRun })).uuid;
  if (!uuid && !dryRun) {
    throw new Error("COOLIFY_APP_UUID is required because Coolify discovery did not find exactly one VerseCraft app.");
  }
  const client = new CoolifyClient({ dryRun });
  const restart = await client.restart(uuid || "dry-run-app");
  await writeRuntimeJson("coolify-restart.json", { uuid, restart, recorded_at: new Date().toISOString() });
  logJson("coolify.restart.completed", { uuid, restart });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
