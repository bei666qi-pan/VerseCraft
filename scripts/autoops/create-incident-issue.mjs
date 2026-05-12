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

  // Read disk remediation summary if exists
  const diskRemediation = await readJsonIfExists(path.join(AUTOOPS_RUNTIME_DIR, "disk-remediation.json"), null);
  const diskDiagnoseBefore = await readJsonIfExists(path.join(AUTOOPS_RUNTIME_DIR, "disk-diagnose-before.json"), null);

  // Build disk sections
  const diskSection = diskRemediation ? `
## Disk Remediation

| Key | Value |
|-----|-------|
| Before level | \`${diskRemediation.before?.level || "unknown"}\` |
| Before usage | \`${diskRemediation.before?.maxUsePct || "?"}%\` |
| Actions | \`${(diskRemediation.actions || []).join(", ") || "none"}\` |
| After level | \`${diskRemediation.after?.level || "unknown"}\` |
| After usage | \`${diskRemediation.after?.maxUsePct || "?"}%\` |
| Recovered | \`${diskRemediation.recovered ? "yes" : "no"}\` |
| Needs manual intervention | \`${diskRemediation.needs_manual_intervention ? "yes" : "no"}\` |
` : "";

  const diskBeforeSection = diskDiagnoseBefore ? `
## Disk Diagnose (Before)

- Filesystems: \`${JSON.stringify(diskDiagnoseBefore.state?.filesystems?.slice(0, 5) || [])}\`
- Max usage: \`${diskDiagnoseBefore.state?.maxUsePct || "?"}%\` on \`${diskDiagnoseBefore.state?.maxUseFilesystem || "?"}\`
- Min free: \`${diskDiagnoseBefore.state?.minFreeGb || "?"}GB\` on \`${diskDiagnoseBefore.state?.minFreeFilesystem || "?"}\`
` : "";

  const evidenceTable = evidence.summary ? `
## Evidence Summary

| Key | Value |
|-----|-------|
| Branch | \`${evidence.summary.branch || "?"}\` |
| HEAD | \`${evidence.summary.head || "?"}\` |
| Node | \`${evidence.summary.node || "?"}\` |
` : "";

  const body = `## Auto-Ops Incident

- **Incident key**: \`${incidentKey}\`
- **Source**: \`${alert.source || "unknown"}\`
- **Alert type**: \`${alert.alert_type || "unknown"}\`
- **Severity**: \`${alert.severity || "warning"}\`
- **Resource**: \`${alert.resource_id || ""}\`
- **Trace**: \`${alert.trace_id || ""}\`
- **Created at**: \`${alert.created_at || new Date().toISOString()}\`
${diskSection}${diskBeforeSection}${evidenceTable}
## Healthcheck

\`\`\`json
${JSON.stringify(healthcheck, null, 2).slice(0, 12000)}
\`\`\`

## Next Action

${diskRemediation && !diskRemediation.recovered ? "- [ ] Disk still critical — manual intervention needed\n- [ ] Check server: `df -h` on ECS instance\n- [ ] Consider extending disk or adding retention policies\n" : ""}${args.codexNeeded || args.localCodex ? "- [ ] Local Codex repair needed\n- [ ] Run: `pnpm autoops:local-codex -- --issue <issue_number> --push-main`\n" : ""}
Runtime artifacts are under \`.ops/autoops/runtime/\` in the workflow workspace.

## Local Codex repair

This project does not use \`OPENAI_API_KEY\` or cloud Codex execution. If this incident needs code repair, run:

\`\`\`bash
pnpm autoops:local-codex -- --issue ${incidentKey === "manual" ? "<issue_number>" : "<issue_number>"} --push-main
\`\`\``;

  const labels = ["auto-ops", "incident", `autoops:${alert.alert_type || "unknown"}`];

  // Disk-related alerts get additional label
  if (["disk_high", "disk_inode_high", "disk_full", "docker_cache", "docker_logs_high", "docker_overlay_high"].includes(alert.alert_type)) {
    labels.push("autoops:disk");
  }

  if (args.codexNeeded || args.localCodex) {
    labels.push("codex-needed");
  }

  if (diskRemediation && !diskRemediation.recovered) {
    labels.push("manual-intervention-needed");
  }

  const uniqueLabels = [...new Set(labels)];

  const client = new GitHubClient({ dryRun, repo: args.repo });
  await client.ensureLabels(uniqueLabels);
  const result = await client.createOrUpdateIssue({
    incidentKey,
    title,
    body,
    labels: uniqueLabels,
  });
  await writeRuntimeJson("incident-issue.json", {
    incident_key: incidentKey,
    issue_number: result.number,
    issue_url: result.url,
    labels: uniqueLabels,
    updated_at: new Date().toISOString(),
  });
  logJson("autoops.incident_issue.completed", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
