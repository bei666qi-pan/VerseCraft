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
  const deploy = await client.deploy(uuid || "dry-run-app", {
    force: Boolean(args.force),
    instant: Boolean(args.instant),
  });
  const deploymentUuid =
    deploy?.deployment_uuid ||
    deploy?.deployment?.deployment_uuid ||
    deploy?.deployments?.[0]?.deployment_uuid ||
    "";
  let poll = null;
  if (deploymentUuid && !args.noPoll) {
    poll = await client.pollDeployment(deploymentUuid, {
      attempts: Number(args.attempts || 36),
      delayMs: Number(args.delayMs || 5000),
    });
  }
  const result = { uuid, deploy, deployment_uuid: deploymentUuid, poll };
  await writeRuntimeJson("coolify-deployment.json", result);
  logJson("coolify.deploy.completed", result);
  if (poll && !poll.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
