#!/usr/bin/env node
import assert from "node:assert/strict";
import { normalizeAlert, decideAutoopsPath } from "./lib/classify-alert.mjs";
import { buildIncidentKey, compactDispatchPayload, assertDispatchPayloadSmall } from "./lib/incident-key.mjs";
import { runHealthcheck } from "./lib/healthcheck.mjs";
import { loadLocalEnvFiles, logJson, writeRuntimeJson } from "./lib/logger.mjs";
import { CoolifyClient } from "./lib/coolify.mjs";
import { VolcEcsClient } from "./lib/volc-openapi.mjs";

async function main() {
  await loadLocalEnvFiles();
  const disk = normalizeAlert({ source: "volcengine-cloudmonitor", alert_type: "disk_high", resource_id: "i-test", trace_id: "t1" });
  assert.equal(disk.alert_type, "disk_high");
  assert.equal(decideAutoopsPath(disk).path, "fast");

  const sentry = normalizeAlert({ source: "sentry", title: "Unhandled TypeError", event_id: "evt-1" });
  assert.equal(sentry.alert_type, "sentry_code_error");
  assert.equal(decideAutoopsPath(sentry).path, "slow");

  const key1 = buildIncidentKey(disk);
  const key2 = buildIncidentKey({ ...disk });
  assert.equal(key1, key2);

  const compact = compactDispatchPayload(disk);
  const size = assertDispatchPayloadSmall(compact);
  assert.ok(size.bytes < 4096);

  await runHealthcheck({ dryRun: true });
  await new CoolifyClient({ dryRun: true }).health();
  await new VolcEcsClient({ dryRun: true }).call("DescribeInstances");

  const result = {
    ok: true,
    checks: ["classify-alert", "incident-key", "dispatch-payload-size", "healthcheck-dry-run", "coolify-dry-run", "volc-dry-run"],
    checked_at: new Date().toISOString(),
  };
  await writeRuntimeJson("self-test.json", result);
  logJson("autoops.self_test.completed", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
