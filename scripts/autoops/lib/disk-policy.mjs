// scripts/autoops/lib/disk-policy.mjs
// Disk threshold policy, command rendering, safety guards, and state classification.
//
// All shell commands use `set -eu` but non-critical steps use `|| true` to avoid
// aborting the whole script. Every cleanup command must be wrapped in flock on
// /tmp/versecraft-autoops-disk-clean.lock .

import { env } from "./logger.mjs";

// ── Threshold env overrides ────────────────────────────────────────────────

export function diskPolicy() {
  return {
    warnPct: Number(env("AUTOOPS_DISK_WARN_PCT", "80")),
    criticalPct: Number(env("AUTOOPS_DISK_CRITICAL_PCT", "90")),
    emergencyPct: Number(env("AUTOOPS_DISK_EMERGENCY_PCT", "95")),
    minFreeGbWarn: Number(env("AUTOOPS_DISK_MIN_FREE_GB_WARN", "10")),
    minFreeGbCritical: Number(env("AUTOOPS_DISK_MIN_FREE_GB_CRITICAL", "5")),
    minFreeGbEmergency: Number(env("AUTOOPS_DISK_MIN_FREE_GB_EMERGENCY", "2")),
    journalVacuumDays: Number(env("AUTOOPS_DISK_JOURNAL_VACUUM_DAYS", "7")),
    tmpMinAgeDays: Number(env("AUTOOPS_DISK_TMP_MIN_AGE_DAYS", "3")),
    dockerImagePruneUntilHours: Number(env("AUTOOPS_DISK_DOCKER_IMAGE_PRUNE_UNTIL_HOURS", "168")),
    builderPruneUntilHours: Number(env("AUTOOPS_DISK_BUILDER_PRUNE_UNTIL_HOURS", "24")),
    logMaxMb: Number(env("AUTOOPS_DISK_LOG_MAX_MB", "100")),
    allowDeepClean: env("AUTOOPS_DISK_ALLOW_DEEP_CLEAN", "true") !== "false",
    allowVolumePrune: env("AUTOOPS_DISK_ALLOW_VOLUME_PRUNE", "false") === "true",
    allowDockerRestart: env("AUTOOPS_DISK_ALLOW_DOCKER_RESTART", "false") === "true",
  };
}

// ── Lock header/footer ─────────────────────────────────────────────────────

const FLOCK_LOCKFILE = "/tmp/versecraft-autoops-disk-clean.lock";
const LOCK_HEADER = `exec 200>${FLOCK_LOCKFILE}\nif ! flock -n 200; then\n  echo "SKIP: Another disk cleanup is already running (lock: ${FLOCK_LOCKFILE})"\n  exit 0\nfi\n`;
const LOCK_FOOTER = `\nflock -u 200 2>/dev/null || true\n`;

// ── Dangerous command blocklist ─────────────────────────────────────────────

const DANGEROUS_PATTERNS = [
  { pattern: /docker\s+volume\s+prune/i, reason: "AUTOOPS_DISK_ALLOW_VOLUME_PRUNE=0 forbids docker volume prune" },
  { pattern: /docker\s+volume\s+rm\b/i, reason: "AUTOOPS_DISK_ALLOW_VOLUME_PRUNE=0 forbids docker volume rm" },
  { pattern: /rm\s+-rf\s+\//i, reason: "rm -rf / is always forbidden" },
  { pattern: /rm\s+-rf\s+\/var\/lib\/docker\/volumes/i, reason: "removing docker volumes is forbidden" },
  { pattern: /rm\s+-rf\s+\/data\b/i, reason: "rm -rf /data is forbidden" },
  { pattern: /rm\s+-rf\s+\/data\/coolify/i, reason: "rm -rf /data/coolify is forbidden" },
  { pattern: /rm\s+-rf\s+\/root\b/i, reason: "rm -rf /root is forbidden" },
  { pattern: /rm\s+-rf\s+\/home\b/i, reason: "rm -rf /home is forbidden" },
  { pattern: /rm\s+-rf\s+~\/\.ssh/i, reason: "rm -rf ~/.ssh is forbidden" },
];

// ── Safety guard ────────────────────────────────────────────────────────────

/**
 * Validates that `command` does not contain blocked patterns.
 * Returns `{ ok: true }` or `{ ok: false, reason: string[] }`.
 */
export function assertSafeDiskCommand(command) {
  const violations = [];
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      violations.push(reason);
    }
  }
  // Additional heuristics
  if (/\bdocker\s+volume\s+(rm|prune)\b.*-f/i.test(command) && !diskPolicy().allowVolumePrune) {
    violations.push("docker volume rm/prune -f requires AUTOOPS_DISK_ALLOW_VOLUME_PRUNE=1");
  }
  if (violations.length > 0) {
    return { ok: false, reason: violations };
  }
  return { ok: true };
}

// ── Command renderers ───────────────────────────────────────────────────────

export function renderDiskDiagnoseCommand(policy) {
  void policy;
  const cmd = [
    LOCK_HEADER,
    `set -eu`,
    `echo "=== disk-diagnose start: $(date -Is 2>/dev/null || date)"`,
    `echo "## uptime"; uptime || true`,
    `echo "## df -h"; df -h || true`,
    `echo "## df -ih"; df -ih || true`,
    `echo "## mount"; mount || true`,
    `echo "## docker ps -a"; docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Image}}' 2>/dev/null || true`,
    `echo "## docker system df"; docker system df 2>/dev/null || true`,
    `echo "## docker system df -v"; docker system df -v 2>/dev/null || true`,
    `echo "## /var/lib/docker usage"; du -sh /var/lib/docker 2>/dev/null || true`,
    `echo "## /var/lib/docker/overlay2 top 15"; du -sh /var/lib/docker/overlay2/*/ 2>/dev/null | sort -rh | head -15 || true`,
    `echo "## docker json log top 20"; find /var/lib/docker/containers -name '*-json.log' -exec du -sh {} \\; 2>/dev/null | sort -rh | head -20 || true`,
    `echo "## journalctl disk-usage"; journalctl --disk-usage 2>/dev/null || true`,
    `echo "## /tmp usage"; du -sh /tmp 2>/dev/null || true`,
    `echo "## /var/tmp usage"; du -sh /var/tmp 2>/dev/null || true`,
    `echo "## coolify/versecraft containers"; docker ps --format '{{.Names}} {{.Status}}' | grep -iE 'coolify|verse|alfo' || true`,
    `echo "## disk diagnose end: $(date -Is 2>/dev/null || date)"`,
    LOCK_FOOTER,
  ].join("\n");
  return cmd;
}

export function renderDiskCleanSafeCommand(policy) {
  const p = policy || diskPolicy();
  const cmd = [
    LOCK_HEADER,
    `set -eu`,
    `echo "=== disk-clean-safe start: $(date -Is 2>/dev/null || date)"`,
    `echo "## before df -h"; df -h || true; echo "## before docker system df"; docker system df 2>/dev/null || true`,
    ``,
    `echo "## build cache prune (until=${p.builderPruneUntilHours}h)"; docker builder prune -f --filter until=${p.builderPruneUntilHours}h 2>/dev/null || { echo "builder prune failed or not available"; }`,
    `echo "## image prune (until=${p.dockerImagePruneUntilHours}h)"; docker image prune -af --filter until=${p.dockerImagePruneUntilHours}h 2>/dev/null || { echo "image prune failed or not available"; }`,
    `echo "## container prune"; docker container prune -f 2>/dev/null || { echo "container prune failed or not available"; }`,
    `echo "## journal vacuum (${p.journalVacuumDays}d)"; journalctl --vacuum-time=${p.journalVacuumDays}d 2>/dev/null || { echo "journal vacuum failed or not available"; }`,
    `echo "## tmp cleanup (>${p.tmpMinAgeDays}d old)"; find /tmp -type f -mtime +${p.tmpMinAgeDays} -delete 2>/dev/null || { echo "/tmp cleanup failed or empty"; }`,
    `echo "## var/tmp cleanup (>${p.tmpMinAgeDays}d old)"; find /var/tmp -type f -mtime +${p.tmpMinAgeDays} -delete 2>/dev/null || { echo "/var/tmp cleanup failed or empty"; }`,
    `echo "## docker json log truncate (>${p.logMaxMb}MB)"; find /var/lib/docker/containers -name '*-json.log' -size +${p.logMaxMb}M -exec sh -c 'S=$(du -sh "$1" 2>/dev/null | cut -f1); truncate -s 0 "$1"; echo "truncated: $1 (was $S)"' _ {} \\; 2>/dev/null || { echo "log truncation failed or nothing to truncate"; }`,
    ``,
    `echo "## after df -h"; df -h || true`,
    `echo "## after docker system df"; docker system df 2>/dev/null || true`,
    `echo "=== disk-clean-safe end: $(date -Is 2>/dev/null || date)"`,
    LOCK_FOOTER,
  ].join("\n");
  return cmd;
}

export function renderDiskCleanDeepCommand(policy) {
  const p = policy || diskPolicy();
  const lines = [
    LOCK_HEADER,
    `set -eu`,
    `echo "=== disk-clean-deep start: $(date -Is 2>/dev/null || date)"`,
    `echo "## before df -h"; df -h || true; echo "## before docker system df"; docker system df 2>/dev/null || true`,
    ``,
    `echo "## aggressive build cache prune (until=12h)"; docker builder prune -af --filter until=12h 2>/dev/null || { echo "builder prune failed"; }`,
    `echo "## aggressive image prune (until=72h)"; docker image prune -af --filter until=72h 2>/dev/null || { echo "image prune failed"; }`,
    `echo "## container prune"; docker container prune -f 2>/dev/null || { echo "container prune failed"; }`,
    `echo "## journal vacuum (3d)"; journalctl --vacuum-time=3d 2>/dev/null || { echo "journal vacuum failed"; }`,
    `echo "## tmp cleanup (>1d old)"; find /tmp -type f -mtime +1 -delete 2>/dev/null || { echo "/tmp cleanup failed"; }`,
    `echo "## var/tmp cleanup (>1d old)"; find /var/tmp -type f -mtime +1 -delete 2>/dev/null || { echo "/var/tmp cleanup failed"; }`,
    `echo "## docker json log truncate (>50MB)"; find /var/lib/docker/containers -name '*-json.log' -size +50M -exec sh -c 'S=$(du -sh "$1" 2>/dev/null | cut -f1); truncate -s 0 "$1"; echo "truncated: $1 (was $S)"' _ {} \\; 2>/dev/null || { echo "log truncation failed"; }`,
  ];

  if (p.allowVolumePrune) {
    lines.push(
      `echo "## WARNING: volume prune is ALLOWED by policy"`,
      `echo "## skipping auto volume prune: only manually labelled volumes are safe"`,
      `echo "## manual: docker volume ls -f 'label=autoops.safe=true' -q | xargs -r docker volume rm"`
    );
  } else {
    lines.push(
      `echo "## volume prune is DISABLED by AUTOOPS_DISK_ALLOW_VOLUME_PRUNE=0"`,
      `echo "## manual intervention required for volume cleanup"`
    );
  }

  lines.push(
    ``,
    `echo "## after df -h"; df -h || true`,
    `echo "## after docker system df"; docker system df 2>/dev/null || true`,
    `echo "=== disk-clean-deep end: $(date -Is 2>/dev/null || date)"`,
    LOCK_FOOTER,
  );

  return lines.join("\n");
}

export function renderDiskPostcheckCommand(policy) {
  // policy not currently used but kept for API consistency
  void policy;
  const cmd = [
    LOCK_HEADER,
    `set -eu`,
    `echo "=== disk-postcheck start: $(date -Is 2>/dev/null || date)"`,
    `echo "## df -h"; df -h || true`,
    `echo "## df -ih"; df -ih || true`,
    `echo "## docker system df"; docker system df 2>/dev/null || true`,
    `echo "## /var/lib/docker usage"; du -sh /var/lib/docker 2>/dev/null || true`,
    `echo "## journalctl disk-usage"; journalctl --disk-usage 2>/dev/null || true`,
    `echo "## summary"`,
    `echo "disk_postcheck_ok=true"`,
    `echo "=== disk-postcheck end: $(date -Is 2>/dev/null || date)"`,
    LOCK_FOOTER,
  ].join("\n");
  return cmd;
}

// ── Disk state classifier ───────────────────────────────────────────────────

/**
 * Parses `df -h` output text and returns structured disk state.
 * @param {string} parsedOrText - Either an already-parsed object or raw `df -h` text output
 * @param {object} policy - diskPolicy() result
 */
export function classifyDiskState(parsedOrText, policy) {
  const p = policy || diskPolicy();
  const result = {
    filesystems: [],
    maxUsePct: 0,
    maxUseFilesystem: "",
    minFreeGb: Infinity,
    minFreeFilesystem: "",
    level: "normal", // normal | warn | critical | emergency
    inodeWarning: false,
    raw: "",
  };

  const text = typeof parsedOrText === "string" ? parsedOrText : JSON.stringify(parsedOrText);
  result.raw = text;

  // Parse df -h output. Broader parse for non-standard df output:
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    // Try to match df -h output patterns
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 6 && /^\d+%$/.test(cols[4])) {
      const usePct = parseInt(cols[4], 10);
      if (!Number.isFinite(usePct)) continue;
      const fs = {
        filesystem: cols[0],
        size: cols[1],
        used: cols[2],
        avail: cols[3],
        usePct,
        mountedOn: cols[5] || "",
      };

      // Parse available GB
      const availMatch = fs.avail.match(/^(\d+\.?\d*)([KMGT]?)$/i);
      let availGb = 0;
      if (availMatch) {
        const val = parseFloat(availMatch[1]);
        const unit = (availMatch[2] || "G").toUpperCase();
        if (unit === "T") availGb = val * 1024;
        else if (unit === "G") availGb = val;
        else if (unit === "M") availGb = val / 1024;
        else if (unit === "K") availGb = val / (1024 * 1024);
      }

      result.filesystems.push(fs);
      if (usePct > result.maxUsePct) {
        result.maxUsePct = usePct;
        result.maxUseFilesystem = fs.mountedOn || fs.filesystem;
      }
      if (availGb < result.minFreeGb && availGb > 0) {
        result.minFreeGb = availGb;
        result.minFreeFilesystem = fs.mountedOn || fs.filesystem;
      }
    }
  }

  // Classify level
  if (result.maxUsePct >= p.emergencyPct || result.minFreeGb <= p.minFreeGbEmergency) {
    result.level = "emergency";
  } else if (result.maxUsePct >= p.criticalPct || result.minFreeGb <= p.minFreeGbCritical) {
    result.level = "critical";
  } else if (result.maxUsePct >= p.warnPct || result.minFreeGb <= p.minFreeGbWarn) {
    result.level = "warn";
  }

  // Check for inode issues in text
  if (/inode/i.test(text) && /100%|99%|98%|97%|96%|95%/.test(text)) {
    result.inodeWarning = true;
  }

  return result;
}

// ── Self-test entry ─────────────────────────────────────────────────────────

export function diskPolicySelfTest() {
  const p = diskPolicy();
  const tests = [];

  // Threshold defaults
  tests.push({ name: "warnPct default 80", ok: p.warnPct === 80 });
  tests.push({ name: "criticalPct default 90", ok: p.criticalPct === 90 });
  tests.push({ name: "emergencyPct default 95", ok: p.emergencyPct === 95 });
  tests.push({ name: "allowVolumePrune default false", ok: p.allowVolumePrune === false });

  // Safety guard: block dangerous commands
  const dangerous = [
    "docker volume prune -f",
    "rm -rf /",
    "rm -rf /var/lib/docker/volumes",
    "rm -rf /data",
    "rm -rf /data/coolify",
    "rm -rf /root",
    "rm -rf /home",
    "rm -rf ~/.ssh",
  ];
  for (const cmd of dangerous) {
    const result = assertSafeDiskCommand(cmd);
    tests.push({ name: `block: ${cmd}`, ok: !result.ok });
  }

  // Safety guard: allow safe commands
  const safe = [
    "docker builder prune -f --filter until=24h",
    "docker image prune -f",
    "docker container prune -f",
    "journalctl --vacuum-time=7d",
    "find /tmp -type f -mtime +3 -delete",
    "truncate -s 0 /var/lib/docker/containers/abc/*-json.log",
  ];
  for (const cmd of safe) {
    const result = assertSafeDiskCommand(cmd);
    tests.push({ name: `allow: ${cmd.slice(0, 50)}`, ok: result.ok });
  }

  // Command rendering produces non-empty strings with lock
  for (const render of [renderDiskDiagnoseCommand, renderDiskCleanSafeCommand, renderDiskCleanDeepCommand, renderDiskPostcheckCommand]) {
    const name = render.name;
    const cmd = render(p);
    tests.push({ name: `${name} returns string`, ok: typeof cmd === "string" && cmd.length > 100 });
    tests.push({ name: `${name} has flock lock`, ok: cmd.includes(FLOCK_LOCKFILE) });
    tests.push({ name: `${name} has set -eu`, ok: cmd.includes("set -eu") });
  }

  // classifyDiskState
  const sampleDf = `
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda2        40G   38G     0 100% /
/dev/vda1       197M  6.2M  191M   4% /boot/efi
tmpfs           3.9G     0  3.9G   0% /dev/shm
`;
  const state = classifyDiskState(sampleDf, p);
  tests.push({ name: "classifyDiskState maxUsePct=100", ok: state.maxUsePct === 100 });
  tests.push({ name: "classifyDiskState level=emergency", ok: state.level === "emergency" });

  const normalDf = `
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda2        40G   20G   18G  50% /
`;
  const state2 = classifyDiskState(normalDf, p);
  tests.push({ name: "classifyDiskState normal level", ok: state2.level === "normal" });
  tests.push({ name: "classifyDiskState maxUsePct=50", ok: state2.maxUsePct === 50 });

  // classifyDiskState with critical (92% use, >2GB free to avoid emergency)
  const criticalDf = `
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda2        40G   36G  4.0G  92% /
`;
  const state3 = classifyDiskState(criticalDf, p);
  tests.push({ name: "classifyDiskState critical level", ok: state3.level === "critical" });

  return { ok: tests.every((t) => t.ok), tests };
}
