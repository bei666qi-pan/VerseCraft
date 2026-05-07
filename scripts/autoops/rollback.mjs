#!/usr/bin/env node
import { execSync } from "node:child_process";
import { CoolifyClient, discoverCoolifyAppUuid } from "./lib/coolify.mjs";
import { runHealthcheck } from "./lib/healthcheck.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryRun(command) {
  try {
    return { ok: true, output: run(command) };
  } catch (error) {
    return { ok: false, output: String(error.stdout || error.stderr || error.message) };
  }
}

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const result = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    strategy: "",
    steps: [],
  };

  const uuid = args.uuid || process.env.COOLIFY_APP_UUID || (await discoverCoolifyAppUuid({ dryRun })).uuid;
  const client = new CoolifyClient({ dryRun });

  try {
    const deployments = uuid ? await client.applicationDeployments(uuid) : await client.deployments();
    const successful = deployments.find((deployment) => /success|finished|completed/i.test(String(deployment.status || "")) && deployment.commit);
    if (successful && !args.forceGitRevert) {
      result.strategy = "coolify_previous_successful_deployment";
      result.steps.push({ name: "selected_previous_deployment", deployment_uuid: successful.deployment_uuid, commit: successful.commit });
      if (!dryRun) {
        const deploy = await client.deploy(uuid, { force: true, instant: true });
        result.steps.push({ name: "coolify_redeploy_requested", deploy });
      }
    } else {
      result.strategy = "git_revert_last_auto_ops_commit";
      const lastCommit = run("git log --format=%H%x09%s -20").split(/\r?\n/).find((line) => /\[auto-ops\]|auto-ops/i.test(line));
      if (!lastCommit) {
        throw new Error("No recent auto-ops commit found for git revert fallback.");
      }
      const sha = lastCommit.split(/\s+/)[0];
      result.steps.push({ name: "selected_git_commit", sha });
      if (!dryRun) {
        result.steps.push({ name: "git_revert", ...tryRun(`git revert --no-edit ${sha}`) });
        result.steps.push({ name: "git_push", ...tryRun("git push origin HEAD:main") });
        if (uuid) {
          result.steps.push({ name: "coolify_deploy", deploy: await client.deploy(uuid, { force: true, instant: true }) });
        }
      }
    }
    const health = await runHealthcheck({ attempts: Number(args.healthAttempts || 3), dryRun });
    result.healthcheck = health;
    result.ok = Boolean(health.ok);
  } catch (error) {
    result.ok = false;
    result.error = error.message;
  }

  await writeRuntimeJson("rollback.json", result);
  logJson("autoops.rollback.completed", result);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
