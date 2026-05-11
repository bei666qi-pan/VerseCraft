import { runHealthcheck } from "./healthcheck.mjs";
import { CoolifyClient, discoverCoolifyAppUuid } from "./coolify.mjs";
import {
  autoopsDefaults,
  logJson,
  warnJson,
  writeRuntimeJson,
  env,
} from "./logger.mjs";

const DEFAULT_COOLIFY_HEALTH_URL = "https://coolify.versecraft.cn/api/health";

async function fetchCoolifyHealth({
  baseUrl = env("COOLIFY_BASE_URL"),
  apiKey = env("COOLIFY_API_KEY"),
} = {}) {
  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      skipped: "Coolify not configured",
      status: 0,
    };
  }
  try {
    const client = new CoolifyClient({
      baseUrl,
      apiKey,
      requestTimeoutMs: 10000,
    });
    const health = await client.health();
    return {
      ok: Boolean(health),
      status: health?.status || 200,
      data: health,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message?.slice(0, 200),
    };
  }
}

export async function pollHealth({
  siteUrl = autoopsDefaults().siteUrl,
  healthUrl = autoopsDefaults().healthUrl,
  attempts = 2,
  timeoutMs = 8000,
} = {}) {
  const startedAt = Date.now();

  const [siteHealth, coolifyHealth] = await Promise.all([
    runHealthcheck({ siteUrl, healthUrl, attempts, timeoutMs }).catch(
      (e) => ({ ok: false, error: e.message?.slice(0, 200) })
    ),
    fetchCoolifyHealth().catch((e) => ({
      ok: false,
      error: e.message?.slice(0, 200),
    })),
  ]);

  const result = {
    ok: siteHealth.ok && coolifyHealth.ok,
    checked_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    site: {
      ok: siteHealth.ok,
      url: healthUrl,
      checks: siteHealth.checks,
    },
    coolify: {
      ok: coolifyHealth.ok,
      url: DEFAULT_COOLIFY_HEALTH_URL,
      status: coolifyHealth.status,
    },
  };

  await writeRuntimeJson("health-poll.json", result);

  if (!result.ok) {
    warnJson("autoops.health_poll.unhealthy", {
      site_ok: siteHealth.ok,
      coolify_ok: coolifyHealth.ok,
    });
  } else {
    logJson("autoops.health_poll.ok", { duration_ms: result.duration_ms });
  }

  return result;
}

export async function attemptRemediation(args = {}) {
  logJson("autoops.health.remediating", {});
  const results = [];

  // Step 1: Run diagnostics via Volc Cloud Assistant
  try {
    const { VolcEcsClient, discoverVolcInstances } = await import(
      "./volc-openapi.mjs"
    );
    const { instanceIds } = await discoverVolcInstances({
      dryRun: args.dryRun,
    });
    if (instanceIds.length > 0) {
      const client = new VolcEcsClient({ dryRun: args.dryRun });
      const diagnoseCmd = [
        'echo "## date"; date -Is || date',
        'echo "## docker ps"; docker ps --format "table {{.Names}}\\t{{.Status}}" 2>&1 || true',
        'echo "## df"; df -h || true',
        'echo "## memory"; free -h || true',
      ].join(";");
      const diagnoseResult = await client.runCommand({
        instanceIds,
        command: diagnoseCmd,
        commandName: "versecraft-autoops-health-diagnose",
        timeout: 30,
      });
      results.push({ step: "diagnose", ...diagnoseResult });
    }
  } catch (error) {
    results.push({ step: "diagnose", error: error.message?.slice(0, 300) });
  }

  // Step 2: Attempt Coolify restart
  try {
    const client = new CoolifyClient({ dryRun: args.dryRun });
    const { uuid } = await discoverCoolifyAppUuid({ dryRun: args.dryRun });
    if (uuid) {
      const restartResult = await client.restart(uuid);
      results.push({ step: "coolify-restart", ...restartResult });
    }
  } catch (error) {
    results.push({
      step: "coolify-restart",
      error: error.message?.slice(0, 300),
    });
  }

  await writeRuntimeJson("health-remediation.json", {
    results,
    at: new Date().toISOString(),
  });
  logJson("autoops.health.remediation.completed", {
    steps: results.length,
  });
  return results;
}
