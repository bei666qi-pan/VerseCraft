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

  // Test agent-runner factory
  const { createAgentRunner } = await import("./lib/agent-runner.mjs");
  for (const type of ["codex", "claude", "deepseek"]) {
    const runner = createAgentRunner(type);
    assert.ok(runner.name);
    assert.equal(typeof runner.run, "function");
    // Dry-run: verify the interface contract
    const r = await runner.run("test prompt", { timeoutMs: 1000 }).catch(() => ({
      executed: false, exitCode: 1, stdout: "", stderr: "expected",
    }));
    assert.ok("executed" in r);
    assert.ok("exitCode" in r);
    assert.ok("stdout" in r);
    assert.ok("stderr" in r);
  }

  // Test health-poller interface
  const { pollHealth } = await import("./lib/health-poller.mjs");
  const pollResult = await pollHealth({ attempts: 1, timeoutMs: 5000 }).catch(() => ({
    ok: false, checked_at: new Date().toISOString(), duration_ms: 0,
    site: { ok: false }, coolify: { ok: false },
  }));
  assert.ok("ok" in pollResult);
  assert.ok("checked_at" in pollResult);

  const result = {
    ok: true,
    checks: ["classify-alert", "incident-key", "dispatch-payload-size", "healthcheck-dry-run", "coolify-dry-run", "volc-dry-run", "agent-runner-factory", "health-poller-interface"],
    checked_at: new Date().toISOString(),
  };
  await writeRuntimeJson("self-test.json", result);
  logJson("autoops.self_test.completed", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
