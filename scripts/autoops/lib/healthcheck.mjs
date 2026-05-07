import { autoopsDefaults, logJson, writeRuntimeJson } from "./logger.mjs";

async function fetchWithTimeout(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "User-Agent": "VerseCraft-AutoOps-Healthcheck",
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      body_excerpt: text.slice(0, 500),
      headers: {
        content_type: response.headers.get("content-type"),
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      duration_ms: Date.now() - startedAt,
      error: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runHealthcheck({
  siteUrl = autoopsDefaults().siteUrl,
  healthUrl = autoopsDefaults().healthUrl,
  attempts = 3,
  timeoutMs = 8000,
  smoke = true,
  dryRun = false,
} = {}) {
  if (dryRun) {
    const result = {
      ok: true,
      dry_run: true,
      site_url: siteUrl,
      health_url: healthUrl,
      attempts,
      timeout_ms: timeoutMs,
      smoke,
    };
    await writeRuntimeJson("healthcheck.json", result);
    logJson("healthcheck.dry_run", result);
    return result;
  }

  const checks = [];
  let healthOk = false;
  let siteOk = false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const health = await fetchWithTimeout(healthUrl, { timeoutMs });
    checks.push({ name: "health", attempt, url: healthUrl, ...health });
    healthOk ||= health.ok;
    if (health.ok) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000 * 2 ** (attempt - 1), 10000)));
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const site = await fetchWithTimeout(siteUrl, { timeoutMs });
    const smokeOk = !smoke || /VerseCraft|文界工坊|__next|html/i.test(site.body_excerpt || "");
    checks.push({ name: "site", attempt, url: siteUrl, smoke_ok: smokeOk, ...site });
    siteOk ||= site.ok && smokeOk;
    if (site.ok && smokeOk) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000 * 2 ** (attempt - 1), 10000)));
  }

  const result = {
    ok: healthOk && siteOk,
    checked_at: new Date().toISOString(),
    site_url: siteUrl,
    health_url: healthUrl,
    checks,
  };
  await writeRuntimeJson("healthcheck.json", result);
  logJson("healthcheck.completed", { ok: result.ok, site_url: siteUrl, health_url: healthUrl });
  return result;
}
