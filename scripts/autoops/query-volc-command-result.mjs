#!/usr/bin/env node
import { VolcEcsClient } from "./lib/volc-openapi.mjs";
import { loadLocalEnvFiles, logJson, parseArgs } from "./lib/logger.mjs";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const client = new VolcEcsClient({ dryRun });
  const result = await client.describeInvocationResults({
    invocationId: args.invocationId,
    commandId: args.commandId,
    instanceId: args.instanceId,
  });
  logJson("volc.query_command_result.completed", { result });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
