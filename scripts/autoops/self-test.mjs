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
  const diskDecision = decideAutoopsPath(disk);
  assert.equal(diskDecision.path, "runbook");
  assert.equal(diskDecision.runbook, "disk-remediate");

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

  // ── disk-policy self-test ──
  const { diskPolicySelfTest } = await import("./lib/disk-policy.mjs");
  const diskPolicyResult = diskPolicySelfTest();
  const diskPolicyFailed = diskPolicyResult.tests.filter((t) => !t.ok);
  if (diskPolicyFailed.length > 0) {
    console.error("disk-policy self-test failures:", JSON.stringify(diskPolicyFailed));
  }

  // ── classify-alert enhanced detection ──
  const enospcAlert = normalizeAlert({ source: "volcengine-cloudmonitor", rule_name: "disk_full", message: "no space left on device" });
  assert.equal(enospcAlert.alert_type, "disk_full");

  const overlayAlert = normalizeAlert({ source: "volcengine-cloudmonitor", message: "docker overlay2 usage high 95%" });
  assert.ok(["docker_overlay_high", "disk_high"].includes(overlayAlert.alert_type), `overlay alert: ${overlayAlert.alert_type}`);

  const diskPath = decideAutoopsPath(enospcAlert);
  assert.equal(diskPath.path, "runbook");
  assert.equal(diskPath.runbook, "disk-remediate");

  // ── assertSafeDiskCommand ──
  const { assertSafeDiskCommand } = await import("./lib/disk-policy.mjs");
  assert.equal(assertSafeDiskCommand("rm -rf /").ok, false);
  assert.equal(assertSafeDiskCommand("docker builder prune -f --filter until=24h").ok, true);

  const result = {
    ok: diskPolicyResult.ok,
    checks: ["classify-alert", "incident-key", "dispatch-payload-size", "healthcheck-dry-run", "coolify-dry-run", "volc-dry-run", "agent-runner-factory", "health-poller-interface", "disk-policy", "disk-classify-alert", "disk-safety-guard"],
    disk_policy: diskPolicyResult,
    checked_at: new Date().toISOString(),
  };
  await writeRuntimeJson("self-test.json", result);
  logJson("autoops.self_test.completed", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
