#!/usr/bin/env node
import { GitHubClient } from "./lib/github.mjs";
import { normalizeAlert } from "./lib/classify-alert.mjs";
import {
  AUTOOPS_RUNTIME_DIR,
  loadLocalEnvFiles,
  logJson,
  parseArgs,
  readJsonIfExists,
  writeRuntimeJson,
} from "./lib/logger.mjs";
import path from "node:path";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const payload =
    args.payload
      ? JSON.parse(args.payload)
      : args.payloadFile
        ? await readJsonIfExists(args.payloadFile, {})
        : await readJsonIfExists(path.join(AUTOOPS_RUNTIME_DIR, "simulate-alert.json"), {});
  const alert = payload.alert || normalizeAlert(payload.client_payload || payload.incident_payload || payload.payload || payload, {});
  const evidence = await readJsonIfExists(path.join(AUTOOPS_RUNTIME_DIR, "runtime-evidence.json"), {});
  const healthcheck = await readJsonIfExists(path.join(AUTOOPS_RUNTIME_DIR, "healthcheck.json"), {});
  const incidentKey = args.incidentKey || alert.incident_key || payload.incident_key || "manual";
  const title = args.title || `[auto-ops] ${incidentKey} ${alert.alert_type || "incident"}`;
  const body = `## Auto-Ops Incident

- Incident key: \`${incidentKey}\`
- Source: \`${alert.source || "unknown"}\`
- Type: \`${alert.alert_type || "unknown"}\`
- Severity: \`${alert.severity || "warning"}\`
- Resource: \`${alert.resource_id || ""}\`
- Trace: \`${alert.trace_id || ""}\`
- Created at: \`${alert.created_at || new Date().toISOString()}\`

## Healthcheck

\`\`\`json
${JSON.stringify(healthcheck, null, 2).slice(0, 12000)}
\`\`\`

## Evidence Summary

\`\`\`json
${JSON.stringify(evidence.summary || {}, null, 2)}
\`\`\`

Runtime artifacts are under \`.ops/autoops/runtime/\` in the workflow workspace. Secrets and full prompt bodies are not copied into this issue.

## Local Codex repair

This project does not use \`OPENAI_API_KEY\` or cloud Codex execution. If this incident needs code repair, run:

\`\`\`bash
pnpm autoops:local-codex -- --issue ${incidentKey === "manual" ? "<issue_number>" : "<issue_number>"} --push-main
\`\`\``;

  const client = new GitHubClient({ dryRun, repo: args.repo });
  const labels = ["auto-ops", "incident", `autoops:${alert.alert_type || "unknown"}`];
  if (args.codexNeeded || args.localCodex) {
    labels.push("codex-needed");
  }
  await client.ensureLabels(labels);
  const result = await client.createOrUpdateIssue({
    incidentKey,
    title,
    body,
    labels,
  });
  await writeRuntimeJson("incident-issue.json", {
    incident_key: incidentKey,
    issue_number: result.number,
    issue_url: result.url,
    labels,
    updated_at: new Date().toISOString(),
  });
  logJson("autoops.incident_issue.completed", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
