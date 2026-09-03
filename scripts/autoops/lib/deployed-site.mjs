function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function assessHealthPayload(payload) {
  if (!isRecord(payload)) return { ok: false, reason: "health_payload_not_object" };
  const checks = isRecord(payload.checks) ? payload.checks : {};
  const worker = isRecord(checks.worker) ? checks.worker : {};
  if (payload.ok !== true) return { ok: false, reason: "health_ok_not_true" };
  if (payload.status !== "healthy") return { ok: false, reason: "health_status_not_healthy" };
  if (checks.database !== "ok") return { ok: false, reason: "database_not_ok" };
  if (checks.aiKey !== "configured") return { ok: false, reason: "ai_not_configured" };
  if (worker.ok !== true || worker.degraded !== false) return { ok: false, reason: "worker_not_healthy" };
  return { ok: true, reason: null };
}

export function assessBuildIdPayload(payload, expectedBuildId) {
  if (!isRecord(payload)) return { ok: false, reason: "build_payload_not_object" };
  const buildId = String(payload.buildId ?? "").trim();
  if (buildId !== expectedBuildId) return { ok: false, reason: "build_id_mismatch" };
  return { ok: true, reason: null };
}

export function assessCoolifyApplicationStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();
  return status === "running:healthy"
    ? { ok: true, reason: null }
    : { ok: false, reason: `coolify_application_not_healthy:${status || "unknown"}` };
}

function cacheBustedUrl(value, attempt) {
  const url = new URL(value);
  url.searchParams.set("deploy_check", `${Date.now()}-${attempt}`);
  return url;
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  return response.json();
}

export async function verifyDeployedSite({
  healthUrl,
  expectedBuildId,
  attempts = 18,
  delayMs = 10_000,
  timeoutMs = 15_000,
  fetchImpl = globalThis.fetch,
  onAttempt = () => {},
}) {
  if (!healthUrl) throw new Error("healthUrl is required");
  if (!/^[0-9a-f]{40}$/i.test(String(expectedBuildId ?? ""))) {
    throw new Error("expectedBuildId must be a full 40-character git SHA");
  }
  const buildUrl = new URL("/api/build-id", healthUrl).toString();
  let last = { ok: false, attempt: 0, healthReason: "not_checked", buildReason: "not_checked", buildId: null };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let healthPayload = null;
    let buildPayload = null;
    let healthReason = null;
    let buildReason = null;
    try {
      healthPayload = await fetchJson(fetchImpl, cacheBustedUrl(healthUrl, attempt), timeoutMs);
      healthReason = assessHealthPayload(healthPayload).reason;
    } catch (error) {
      healthReason = `health_request_failed:${error instanceof Error ? error.message : String(error)}`;
    }
    try {
      buildPayload = await fetchJson(fetchImpl, cacheBustedUrl(buildUrl, attempt), timeoutMs);
      buildReason = assessBuildIdPayload(buildPayload, expectedBuildId).reason;
    } catch (error) {
      buildReason = `build_request_failed:${error instanceof Error ? error.message : String(error)}`;
    }

    const buildId = isRecord(buildPayload) ? String(buildPayload.buildId ?? "") || null : null;
    last = { ok: healthReason === null && buildReason === null, attempt, healthReason, buildReason, buildId };
    onAttempt(last);
    if (last.ok) return last;
    if (attempt < attempts && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return last;
}
