#!/usr/bin/env node
// scripts/autoops/disk-remediate.mjs
// Tiered disk remediation flow: diagnose → safe clean → postcheck → deep clean (if needed).

import {
  diskPolicy,
  renderDiskDiagnoseCommand,
  renderDiskCleanSafeCommand,
  renderDiskCleanDeepCommand,
  renderDiskPostcheckCommand,
  classifyDiskState,
  assertSafeDiskCommand,
} from "./lib/disk-policy.mjs";
import { discoverVolcInstances, VolcEcsClient } from "./lib/volc-openapi.mjs";
import {
  ensureRuntimeDir,
  loadLocalEnvFiles,
  logJson,
  warnJson,
  parseArgs,
  writeRuntimeJson,
} from "./lib/logger.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveMode(args) {
  const mode = args.mode || "auto";
  if (!["diagnose", "safe", "deep", "auto"].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Supported: diagnose, safe, deep, auto`);
  }
  return mode;
}

async function runEcsCommand({ client, instanceIds, command, runbookName, dryRun }) {
  if (dryRun) {
    logJson("disk_remediate.dry_run_command", { runbook: runbookName, instance_ids: instanceIds });
    return { dryRun: true, output: `[dry-run] ${runbookName}` };
  }

  const result = await client.runCommand({
    instanceIds,
    command,
    commandName: `versecraft-autoops-${runbookName}`,
    timeout: 90,
  });
  logJson("disk_remediate.command_done", { runbook: runbookName });
  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await loadLocalEnvFiles();
  await ensureRuntimeDir();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const policy = diskPolicy();

  // Overridable thresholds from CLI
  if (args.criticalPct) policy.criticalPct = Number(args.criticalPct);
  if (args.emergencyPct) policy.emergencyPct = Number(args.emergencyPct);

  const mode = resolveMode(args);

  logJson("disk_remediate.start", { mode, dry_run: dryRun, policy: { warnPct: policy.warnPct, criticalPct: policy.criticalPct, emergencyPct: policy.emergencyPct } });

  // 1. Discover instances
  const discovered = await discoverVolcInstances({ dryRun });
  const rawIds = args.instanceIds || discovered.instanceIds?.join(",") || "";
  const instanceIds = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (!instanceIds.length && !dryRun) {
    throw new Error("No ECS instances available. Set VOLC_ECS_INSTANCE_IDS or run discovery.");
  }

  const client = new VolcEcsClient({ dryRun });

  // 2. Phase: Diagnose (before)
  logJson("disk_remediate.phase", { phase: "diagnose" });
  const beforeCmd = renderDiskDiagnoseCommand(policy);
  const beforeResult = await runEcsCommand({
    client,
    instanceIds: instanceIds.length ? instanceIds : ["dry-run-instance"],
    command: beforeCmd,
    runbookName: "disk-diagnose",
    dryRun,
  });
  const beforeText = beforeResult?.output || beforeResult?.raw || JSON.stringify(beforeResult);
  const beforeState = classifyDiskState(beforeText, policy);
  await writeRuntimeJson("disk-diagnose-before.json", { state: beforeState, raw: beforeText, at: new Date().toISOString() });
  logJson("disk_remediate.diagnose_before", { level: beforeState.level, maxUsePct: beforeState.maxUsePct, minFreeGb: beforeState.minFreeGb });

  // 3. Decide actions
  const actions = [];
  const errors = [];
  let recovered = beforeState.level === "normal" || beforeState.level === "warn";

  if (mode === "diagnose") {
    logJson("disk_remediate.mode_diagnose_only", { level: beforeState.level });
  } else if (mode === "auto") {
    // Auto mode: decide based on threshold
    if (beforeState.level === "normal") {
      logJson("disk_remediate.decision", { decision: "skip", reason: "disk normal", level: beforeState.level });
    } else if (beforeState.level === "warn") {
      logJson("disk_remediate.decision", { decision: "safe_clean", reason: "disk warning", level: beforeState.level });
      actions.push("safe");
    } else if (beforeState.level === "critical") {
      logJson("disk_remediate.decision", { decision: "safe_clean_then_postcheck", reason: "disk critical", level: beforeState.level });
      actions.push("safe");
    } else if (beforeState.level === "emergency") {
      logJson("disk_remediate.decision", { decision: "safe_then_deep", reason: "disk emergency", level: beforeState.level });
      actions.push("safe");
      if (policy.allowDeepClean) {
        actions.push("deep");
      }
    }
  } else {
    // Explicit mode: safe or deep
    actions.push(mode);
  }

  // 4. Execute clean actions
  for (const action of actions) {
    const cmd = action === "deep"
      ? renderDiskCleanDeepCommand(policy)
      : renderDiskCleanSafeCommand(policy);

    const safety = assertSafeDiskCommand(cmd);
    if (!safety.ok) {
      const err = `Safety check failed for disk-clean-${action}: ${safety.reason.join("; ")}`;
      errors.push(err);
      warnJson("disk_remediate.safety_blocked", { action, violations: safety.reason });
      continue;
    }

    logJson("disk_remediate.executing", { action });
    try {
      await runEcsCommand({
        client,
        instanceIds: instanceIds.length ? instanceIds : ["dry-run-instance"],
        command: cmd,
        runbookName: `disk-clean-${action}`,
        dryRun,
      });
    } catch (err) {
      errors.push(`disk-clean-${action} failed: ${err.message}`);
      warnJson("disk_remediate.clean_failed", { action, error: err.message });
    }
  }

  // 5. Postcheck
  logJson("disk_remediate.phase", { phase: "postcheck" });
  const afterCmd = renderDiskPostcheckCommand(policy);
  let afterState = null;
  let afterText = "";
  try {
    const afterResult = await runEcsCommand({
      client,
      instanceIds: instanceIds.length ? instanceIds : ["dry-run-instance"],
      command: afterCmd,
      runbookName: "disk-postcheck",
      dryRun,
    });
    afterText = afterResult?.output || afterResult?.raw || JSON.stringify(afterResult);
    afterState = classifyDiskState(afterText, policy);
    await writeRuntimeJson("disk-diagnose-after.json", { state: afterState, raw: afterText, at: new Date().toISOString() });
  } catch (err) {
    errors.push(`postcheck failed: ${err.message}`);
    warnJson("disk_remediate.postcheck_failed", { error: err.message });
    afterState = { level: "unknown", maxUsePct: 0, minFreeGb: 0 };
  }

  // 6. Determine recovery
  if (afterState && afterState.level !== "unknown") {
    recovered = afterState.level === "normal" || afterState.level === "warn";
    logJson("disk_remediate.postcheck_result", { beforeLevel: beforeState.level, afterLevel: afterState.level, recovered });
  } else {
    // Postcheck failed or returned unknown level — cannot confirm recovery
    recovered = false;
    logJson("disk_remediate.postcheck_result", { beforeLevel: beforeState.level, afterLevel: "unknown", recovered, reason: "postcheck failed or returned unknown state" });
  }

  const needsManualIntervention = !recovered && afterState && afterState.level === "critical";

  // 7. Write final artifact
  const summary = {
    before: beforeState,
    actions,
    after: afterState,
    thresholds: {
      warnPct: policy.warnPct,
      criticalPct: policy.criticalPct,
      emergencyPct: policy.emergencyPct,
      minFreeGbWarn: policy.minFreeGbWarn,
      minFreeGbCritical: policy.minFreeGbCritical,
      minFreeGbEmergency: policy.minFreeGbEmergency,
    },
    recovered,
    needs_manual_intervention: needsManualIntervention,
    errors,
    mode,
    dry_run: dryRun,
    completed_at: new Date().toISOString(),
  };

  await writeRuntimeJson("disk-remediation.json", summary);
  logJson("disk_remediate.completed", { recovered, needs_manual_intervention: needsManualIntervention, errors: errors.length });

  // Exit codes
  if (!recovered && needsManualIntervention) {
    logJson("disk_remediate.exit_critical", { reason: "still critical after remediation" });
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
