#!/usr/bin/env node
import { discoverVolcInstances, VolcEcsClient } from "./lib/volc-openapi.mjs";
import { loadLocalEnvFiles, logJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

const RUNBOOKS = {
  diagnose: `set -eu
echo "## date"; date -Is || date
echo "## uptime"; uptime || true
echo "## df"; df -h || true
echo "## memory"; free -h || true
echo "## processes"; (ps aux --sort=-%cpu | head -20) 2>/dev/null || (busybox ps | head -30) || true
echo "## docker ps"; docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Image}}' || true
echo "## docker system df"; docker system df || true
echo "## journal"; journalctl -n 120 --no-pager 2>/dev/null || true
echo "## o11y"; (command -v o11yagentctl >/dev/null && o11yagentctl ps) || true`,
  "clean-disk": `set -eu
echo "## before"; df -h || true; docker system df || true
echo "## prune docker builder cache"; docker builder prune -af --filter until=24h || true
echo "## prune old dangling/unused images"; docker image prune -af --filter until=168h || true
echo "## prune stopped containers"; docker container prune -f || true
echo "## vacuum journal"; journalctl --vacuum-time=7d 2>/dev/null || true
echo "## after"; df -h || true; docker system df || true`,
  "restart-o11y": `set -eu
echo "## restart o11y agent"
if command -v o11yagentctl >/dev/null; then
  o11yagentctl restart || true
  sleep 3
  o11yagentctl ps || true
elif systemctl list-unit-files 2>/dev/null | grep -q o11y; then
  systemctl restart o11yagent || true
  systemctl status o11yagent --no-pager || true
else
  echo "o11y agent command/service not found"
fi`,
  "docker-diagnose": `set -eu
echo "## docker version"; docker version || true
echo "## docker ps"; docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Image}}' || true
echo "## docker system df"; docker system df || true
echo "## recent docker events"; timeout 5s docker events --since 30m || true`,
  "coolify-diagnose": `set -eu
echo "## coolify containers"; docker ps -a --format '{{.Names}} {{.Status}} {{.Image}}' | grep -i coolify || true
echo "## coolify logs"; for c in $(docker ps --format '{{.Names}}' | grep -i coolify | head -5); do echo "# $c"; docker logs "$c" --tail 120 2>&1 || true; done`,
  "docker-log-rotate": `set -eu
echo "## before log sizes"
find /var/lib/docker/containers -name '*-json.log' -exec du -sh {} \\; 2>/dev/null | sort -rh | head -10 || true
echo "## truncate logs over 100M"
find /var/lib/docker/containers -name '*-json.log' -size +100M -exec sh -c 'truncate -s 0 "$1"; echo "truncated: $1"' _ {} \\; 2>/dev/null || true
echo "## configure docker daemon log rotation"
mkdir -p /etc/docker
if [ -f /etc/docker/daemon.json ]; then
  cp /etc/docker/daemon.json /etc/docker/daemon.json.bak.$(date +%s) 2>/dev/null || true
  python3 -c "
import json, sys
try:
    with open('/etc/docker/daemon.json') as f: c = json.load(f)
except: c = {}
c.setdefault('log-driver', 'json-file')
c.setdefault('log-opts', {})
c['log-opts'].setdefault('max-size', '50m')
c['log-opts'].setdefault('max-file', '3')
with open('/etc/docker/daemon.json', 'w') as f: json.dump(c, f, indent=2)
print('daemon.json updated')
" 2>/dev/null || echo '{"log-driver":"json-file","log-opts":{"max-size":"50m","max-file":"3"}}' > /etc/docker/daemon.json
fi
echo "## daemon.json:"; cat /etc/docker/daemon.json
echo "## after sizes"
find /var/lib/docker/containers -name '*-json.log' -exec du -sh {} \\; 2>/dev/null | sort -rh | head -10 || true
echo "## note: restart docker (systemctl restart docker) for new containers to pick up log-opts"`,
  "app-logs": `set -eu
echo "## versecraft containers"; docker ps -a --format '{{.Names}} {{.Status}} {{.Image}}' | grep -Ei 'versecraft|coolify|next' || true
for c in $(docker ps --format '{{.Names}}' | grep -Ei 'versecraft|next|coolify' | head -8); do echo "# logs $c"; docker logs "$c" --tail 160 2>&1 || true; done`,
};

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const runbook = args.runbook || args._[0] || "diagnose";
  const dryRun = Boolean(args.dryRun);
  const command = RUNBOOKS[runbook];
  if (!command) {
    throw new Error(`Unknown runbook "${runbook}". Supported: ${Object.keys(RUNBOOKS).join(", ")}`);
  }
  const discovered = await discoverVolcInstances({ dryRun });
  const instanceIds = String(args.instanceIds || discovered.instanceIds?.join(",") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!instanceIds.length && !dryRun) {
    await writeRuntimeJson("discovery-report.json", {
      error: "VOLC_ECS_INSTANCE_IDS is required because auto discovery did not return exactly one ECS instance.",
      discovered,
    });
    throw new Error("No unique ECS instance discovered. Set VOLC_ECS_INSTANCE_IDS.");
  }
  const client = new VolcEcsClient({ dryRun });
  const result = await client.runCommand({
    instanceIds: instanceIds.length ? instanceIds : ["dry-run-instance"],
    command,
    commandName: `versecraft-autoops-${runbook}`,
    timeout: Number(args.timeout || 90),
  });
  logJson("volc.run_command.completed", { runbook, instance_ids: instanceIds, result });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
