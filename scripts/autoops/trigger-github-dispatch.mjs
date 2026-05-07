#!/usr/bin/env node
import { GitHubClient } from "./lib/github.mjs";
import { normalizeAlert } from "./lib/classify-alert.mjs";
import { compactDispatchPayload } from "./lib/incident-key.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, readJsonIfExists } from "./lib/logger.mjs";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const payload = args.payload
    ? JSON.parse(args.payload)
    : args.payloadFile
      ? await readJsonIfExists(args.payloadFile, {})
      : {
          source: args.source || "manual",
          alert_type: args.type || args.alertType || "unknown",
          severity: args.severity || "warning",
          resource_id: args.resourceId || "",
          trace_id: args.traceId || "",
        };
  const alert = normalizeAlert(payload, {});
  const incident = compactDispatchPayload({ ...alert, action: args.action, runbook: args.runbook });
  const eventType = args.eventType || "autoops-runbook";
  const client = new GitHubClient({ dryRun, repo: args.repo });
  const result = await client.repositoryDispatch(eventType, incident);
  logJson("github.dispatch.completed", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
