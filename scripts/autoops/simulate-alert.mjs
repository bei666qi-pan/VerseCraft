#!/usr/bin/env node
import { normalizeAlert, decideAutoopsPath } from "./lib/classify-alert.mjs";
import { GitHubClient } from "./lib/github.mjs";
import { compactDispatchPayload } from "./lib/incident-key.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

function sampleAlert(type) {
  const common = {
    source: "manual",
    severity: "warning",
    resource_id: "simulate-versecraft",
    trace_id: `simulate-${Date.now()}`,
    created_at: new Date().toISOString(),
  };
  const samples = {
    app_health_failed: { ...common, source: "external-health", alert_type: "app_health_failed", url: "https://versecraft.cn/api/health", status_code: 503 },
    disk_high: { ...common, source: "volcengine-cloudmonitor", alert_type: "disk_high", metric_name: "disk_used_percent", value: 92 },
    o11y_agent_disconnected: { ...common, source: "volcengine-cloudmonitor", alert_type: "o11y_agent_disconnected", message: "o11y agent offline" },
    sentry_code_error: { ...common, source: "sentry", alert_type: "sentry_code_error", title: "Unhandled exception" },
    apm_slow_endpoint: { ...common, source: "apmplus", alert_type: "apm_slow_endpoint", endpoint: "/api/chat", duration_ms: 8500 },
    build_failed: { ...common, source: "github", alert_type: "build_failed", message: "pnpm build failed" },
  };
  return samples[type] || { ...common, alert_type: type || "unknown", message: "manual simulated alert" };
}

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const payload = args.payload ? JSON.parse(args.payload) : sampleAlert(args.type || "unknown");
  const alert = normalizeAlert(payload, {});
  const decision = decideAutoopsPath(alert);
  const eventType = decision.path === "slow" ? "autoops-codex" : "autoops-runbook";
  const clientPayload = compactDispatchPayload({ ...alert, runbook: decision.runbook });
  await writeRuntimeJson("simulate-alert.json", { payload, alert, decision, event_type: eventType, client_payload: clientPayload });
  logJson("autoops.simulate.classified", { alert, decision, event_type: eventType, client_payload: clientPayload });
  if (dryRun) {
    return;
  }
  const client = new GitHubClient();
  await client.repositoryDispatch(eventType, clientPayload);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
