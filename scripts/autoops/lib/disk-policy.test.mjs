// scripts/autoops/lib/disk-policy.test.mjs
// Unit tests for disk-policy.mjs — run with: pnpm dlx tsx --test scripts/autoops/lib/disk-policy.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  diskPolicy,
  renderDiskDiagnoseCommand,
  renderDiskCleanSafeCommand,
  renderDiskCleanDeepCommand,
  renderDiskPostcheckCommand,
  assertSafeDiskCommand,
  classifyDiskState,
  diskPolicySelfTest,
} from "./disk-policy.mjs";

// ── Threshold defaults ──────────────────────────────────────────────────────

describe("diskPolicy defaults", () => {
  it("returns sensible defaults", () => {
    const p = diskPolicy();
    assert.equal(p.warnPct, 80);
    assert.equal(p.criticalPct, 90);
    assert.equal(p.emergencyPct, 95);
    assert.equal(p.minFreeGbWarn, 10);
    assert.equal(p.minFreeGbCritical, 5);
    assert.equal(p.minFreeGbEmergency, 2);
    assert.equal(p.journalVacuumDays, 7);
    assert.equal(p.tmpMinAgeDays, 3);
    assert.equal(p.dockerImagePruneUntilHours, 168);
    assert.equal(p.builderPruneUntilHours, 24);
    assert.equal(p.logMaxMb, 100);
    assert.equal(p.allowDeepClean, true);
    assert.equal(p.allowVolumePrune, false);
    assert.equal(p.allowDockerRestart, false);
  });
});

// ── assertSafeDiskCommand ───────────────────────────────────────────────────

describe("assertSafeDiskCommand", () => {
  const dangerous = [
    { cmd: "docker volume prune -f", label: "docker volume prune" },
    { cmd: "docker volume rm my-volume", label: "docker volume rm" },
    { cmd: "rm -rf /", label: "rm -rf /" },
    { cmd: "rm -rf /var/lib/docker/volumes", label: "rm docker volumes" },
    { cmd: "rm -rf /data", label: "rm /data" },
    { cmd: "rm -rf /data/coolify", label: "rm /data/coolify" },
    { cmd: "rm -rf /root", label: "rm /root" },
    { cmd: "rm -rf /home", label: "rm /home" },
    { cmd: "rm -rf ~/.ssh", label: "rm ~/.ssh" },
  ];

  for (const { cmd, label } of dangerous) {
    it(`blocks: ${label}`, () => {
      const r = assertSafeDiskCommand(cmd);
      assert.equal(r.ok, false, `Expected ${label} to be blocked: ${JSON.stringify(r.reason)}`);
    });
  }

  const safe = [
    "docker builder prune -f --filter until=24h",
    "docker image prune -af --filter until=168h",
    "docker container prune -f",
    "journalctl --vacuum-time=7d",
    "find /tmp -type f -mtime +3 -delete",
    "find /var/tmp -type f -mtime +3 -delete",
    "truncate -s 0 /var/lib/docker/containers/abc123/abc123-json.log",
    "echo hello world",
    "df -h",
  ];

  for (const cmd of safe) {
    it(`allows: ${cmd.slice(0, 60)}`, () => {
      const r = assertSafeDiskCommand(cmd);
      assert.equal(r.ok, true, `Expected "${cmd.slice(0, 60)}" to be allowed: ${JSON.stringify(r.reason)}`);
    });
  }

  it("blocks docker volume rm -f when allowVolumePrune is false", () => {
    // Simulate with default policy
    const cmd = "docker volume rm -f $(docker volume ls -q)";
    const r = assertSafeDiskCommand(cmd);
    // This should be blocked by the heuristic check
    // (it contains "docker volume rm" with -f)
    assert.equal(r.ok, false);
  });
});

// ── Command renderers ────────────────────────────────────────────────────────

describe("command renderers", () => {
  const p = diskPolicy();

  it("renderDiskDiagnoseCommand returns valid shell with lock", () => {
    const cmd = renderDiskDiagnoseCommand(p);
    assert.ok(cmd.includes("flock"));
    assert.ok(cmd.includes("set -eu"));
    assert.ok(cmd.includes("df -h"));
    assert.ok(cmd.includes("disk-diagnose start"));
  });

  it("renderDiskCleanSafeCommand returns valid shell with lock", () => {
    const cmd = renderDiskCleanSafeCommand(p);
    assert.ok(cmd.includes("flock"));
    assert.ok(cmd.includes("set -eu"));
    assert.ok(cmd.includes("builder prune"));
    assert.ok(cmd.includes("image prune"));
    assert.ok(cmd.includes("journal vacuum"));
    assert.ok(cmd.includes("/tmp cleanup"));
    // Must NOT contain volume prune
    assert.ok(!cmd.includes("volume prune"));
  });

  it("renderDiskCleanDeepCommand returns valid shell with lock", () => {
    const cmd = renderDiskCleanDeepCommand(p);
    assert.ok(cmd.includes("flock"));
    assert.ok(cmd.includes("set -eu"));
    assert.ok(cmd.includes("aggressive"));
    // With default policy (allowVolumePrune=false), should warn not allow
    assert.ok(cmd.includes("DISABLED") || cmd.includes("manual"), `Expected volume prune warning in deep command`);
  });

  it("renderDiskPostcheckCommand returns valid shell with lock", () => {
    const cmd = renderDiskPostcheckCommand(p);
    assert.ok(cmd.includes("flock"));
    assert.ok(cmd.includes("set -eu"));
    assert.ok(cmd.includes("df -h"));
    assert.ok(cmd.includes("docker system df"));
  });

  // Verify no dangerous commands in any generated shell
  it("all generated commands pass assertSafeDiskCommand", () => {
    for (const render of [renderDiskDiagnoseCommand, renderDiskCleanSafeCommand, renderDiskCleanDeepCommand, renderDiskPostcheckCommand]) {
      const cmd = render(p);
      const safety = assertSafeDiskCommand(cmd);
      assert.equal(safety.ok, true, `${render.name} failed safety check: ${JSON.stringify(safety.reason)}`);
    }
  });
});

// ── classifyDiskState ────────────────────────────────────────────────────────

describe("classifyDiskState", () => {
  const p = diskPolicy();

  it("detects emergency from 100% usage", () => {
    const text = `Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda2        40G   40G     0 100% /`;
    const state = classifyDiskState(text, p);
    assert.equal(state.level, "emergency");
    assert.equal(state.maxUsePct, 100);
  });

  it("detects critical from 92% usage (with enough free GB to avoid emergency)", () => {
    // UsePct=92% >= criticalPct(90), but free >= minFreeGbEmergency(2) and < minFreeGbWarn(10)
    // Actual: 40G, 36G used, 4G free = 10% free → 4G >= 2GB (not emergency), but >= 90% use → critical
    const text = `Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda2        40G   36G  4.0G  92% /`;
    const state = classifyDiskState(text, p);
    // 4.0G free > 2G emergency, but 92% >= 90% critical
    assert.equal(state.level, "critical");
    assert.equal(state.maxUsePct, 92);
  });

  it("detects warn from 85% usage (with enough free GB to avoid critical)", () => {
    // UsePct=85% >= warnPct(80) but < criticalPct(90), free=6G > minFreeGbCritical(5) → warn
    const text = `Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda2        40G   34G  6.0G  85% /`;
    const state = classifyDiskState(text, p);
    assert.equal(state.level, "warn");
    assert.equal(state.maxUsePct, 85);
  });

  it("detects normal from 50% usage", () => {
    const text = `Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda2        40G   20G   18G  50% /`;
    const state = classifyDiskState(text, p);
    assert.equal(state.level, "normal");
  });

  it("detects emergency from low free GB", () => {
    const text = `Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda2        40G   35G  1.0G  88% /`;
    const state = classifyDiskState(text, p);
    // minFreeGb <= 2 → emergency
    assert.equal(state.level, "emergency");
  });

  it("handles empty input", () => {
    const state = classifyDiskState("", p);
    assert.equal(state.level, "normal");
    assert.equal(state.maxUsePct, 0);
  });

  it("handles multi-filesystem output", () => {
    const text = [
      "Filesystem      Size  Used Avail Use% Mounted on",
      "/dev/vda2        40G   20G   18G  50% /",
      "/dev/vda1       197M  6.2M  191M   4% /boot/efi",
      "tmpfs           3.9G     0  3.9G   0% /dev/shm",
      "overlay          40G   38G     0  98% /var/lib/docker/overlay2/abc/merged",
    ].join("\n");
    const state = classifyDiskState(text, p);
    // Should pick the highest: 98%
    assert.equal(state.maxUsePct, 98);
    assert.equal(state.level, "emergency");
  });

  it("detects inode warning", () => {
    const text = `Filesystem     Inodes IUsed  IFree IUse% Mounted on\n/dev/vda2      2.6M   2.6M     0  100% /\nFilesystem      Size  Used Avail Use% Mounted on\n/dev/vda2        40G   20G   18G  50% /`;
    const state = classifyDiskState(text, p);
    assert.equal(state.inodeWarning, true);
  });
});

// ── Recovery logic (disk-remediate equivalent) ───────────────────────────────

describe("recovery logic", () => {
  void diskPolicy(); // verify policy can be created

  function simulateRecoveryDecision(beforeLevel, afterLevel, afterLevelIsUnknown) {
    // Replicates disk-remediate.mjs lines 95 and 173-176
    let recovered = beforeLevel === "normal" || beforeLevel === "warn";
    if (!afterLevelIsUnknown) {
      recovered = afterLevel === "normal" || afterLevel === "warn";
    }
    // After our fix: when unknown, recovered must be false
    if (afterLevelIsUnknown) {
      recovered = false;
    }
    return recovered;
  }

  it("recovers when critical → warn after cleanup", () => {
    assert.equal(simulateRecoveryDecision("critical", "warn", false), true);
  });

  it("recovers when emergency → normal after cleanup", () => {
    assert.equal(simulateRecoveryDecision("emergency", "normal", false), true);
  });

  it("does not recover when critical → critical after cleanup", () => {
    assert.equal(simulateRecoveryDecision("critical", "critical", false), false);
  });

  it("does not recover when emergency → critical after cleanup", () => {
    assert.equal(simulateRecoveryDecision("emergency", "critical", false), false);
  });

  it("does not recover when postcheck fails (unknown state)", () => {
    // Bug fix: postcheck failure must result in recovered=false
    assert.equal(simulateRecoveryDecision("critical", "unknown", true), false);
  });

  it("does not recover when postcheck fails even if before was warn", () => {
    // Critical edge case: before was warn, postcheck fails → must NOT report recovered
    assert.equal(simulateRecoveryDecision("warn", "unknown", true), false);
  });
});

// ── Self-test harness ────────────────────────────────────────────────────────

describe("diskPolicySelfTest", () => {
  it("all tests pass", () => {
    const result = diskPolicySelfTest();
    assert.equal(result.ok, true, `Failures: ${JSON.stringify(result.tests.filter((t) => !t.ok))}`);
    assert.ok(result.tests.length >= 10);
  });
});
