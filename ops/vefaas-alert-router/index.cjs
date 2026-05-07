/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const crypto = require("node:crypto");

const seenTraceIds = new Set();
const seenIncidentKeys = new Map();
const DEDUPE_TTL_MS = Number(process.env.AUTOOPS_ALERT_DEDUPE_TTL_MS || 5 * 60 * 1000);
const DOWNSTREAM_TIMEOUT_MS = Number(process.env.AUTOOPS_ALERT_ROUTER_DOWNSTREAM_TIMEOUT_MS || 1200);
const VOLC_ENDPOINT = "https://open.volcengineapi.com";
const VOLC_HOST = "open.volcengineapi.com";

function logJson(event, data = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function warnJson(event, data = {}) {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function objectFromMaybeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function eventRoot(event) {
  const root = objectFromMaybeJson(event, {});
  const data = objectFromMaybeJson(root.data, null);
  return data && (data.body || data.headers || data.queryStringParameters) ? data : root;
}

function parseBody(event) {
  const root = eventRoot(event);
  if (root.source || root.alert_type || root.type || root.AlarmRuleName || root.rule_name || root.message || root.resource_id) {
    return root;
  }
  const raw = root.body || root.Body || "";
  if (!raw) return {};
  const text = (root.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : String(raw)).replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2048) };
  }
}

function headersOf(event) {
  const root = eventRoot(event);
  return root.headers || root.Headers || {};
}

function queryOf(event) {
  const root = eventRoot(event);
  const query = root.queryStringParameters || root.query || root.Query || root.QueryStringParameters;
  if (query && typeof query === "object") return query;
  const raw = root.rawQueryString || root.queryString || root.QueryString || "";
  return raw ? Object.fromEntries(new URLSearchParams(String(raw))) : {};
}

function getSecret(headers, query) {
  const normalized = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
  const headerSecret = Array.isArray(normalized["x-autoops-secret"]) ? normalized["x-autoops-secret"][0] : normalized["x-autoops-secret"];
  const routerSecret = Array.isArray(normalized["x-alert-router-secret"])
    ? normalized["x-alert-router-secret"][0]
    : normalized["x-alert-router-secret"];
  const authorization = Array.isArray(normalized.authorization) ? normalized.authorization[0] : normalized.authorization;
  return query.secret || query.autoops_secret || headerSecret || routerSecret || authorization?.replace(/^Bearer\s+/i, "");
}

function verifySecret(event) {
  const expected = process.env.AUTOOPS_ALERT_ROUTER_SECRET;
  const actual = getSecret(headersOf(event), queryOf(event));
  if (!expected) return { ok: false, reason: "AUTOOPS_ALERT_ROUTER_SECRET is not configured" };
  if (!actual || actual !== expected) return { ok: false, reason: "invalid secret" };
  return { ok: true };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function shortHash(value, length = 12) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function safeSegment(value, fallback = "unknown") {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

function buildIncidentKey(input = {}) {
  const source = safeSegment(input.source);
  const alertType = safeSegment(input.alert_type || input.type);
  const resourceId = safeSegment(input.resource_id || input.resourceId || input.resource || input.instance_id);
  const basis = {
    source,
    alertType,
    resourceId,
    traceId: input.trace_id || input.traceId || "",
    fingerprint: input.fingerprint || input.event_id || input.id || "",
  };
  return `${source}:${alertType}:${resourceId}:${shortHash(stableJson(basis), 10)}`;
}

function compactDispatchPayload(input = {}) {
  const payload = {
    incident_key: input.incident_key || buildIncidentKey(input),
    source: input.source || "unknown",
    severity: input.severity || "warning",
    resource_id: input.resource_id || input.resourceId || input.resource || "",
    alert_type: input.alert_type || input.type || "unknown",
    trace_id: input.trace_id || input.traceId || "",
    created_at: input.created_at || input.createdAt || new Date().toISOString(),
    runbook: input.runbook || undefined,
  };
  if (input.dry_run !== undefined || input.dryRun !== undefined) {
    payload.dry_run = Boolean(input.dry_run ?? input.dryRun);
  }
  return payload;
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
}

function detectSource(payload = {}, headers = {}) {
  const normalized = normalizeHeaders(headers);
  const explicit = payload.source || payload.alert_source || payload.platform || normalized["x-autoops-source"] || normalized["x-alert-source"];
  if (explicit) return String(explicit).toLowerCase();
  const userAgent = String(normalized["user-agent"] || "").toLowerCase();
  if (payload.event || payload.project || payload.issue || userAgent.includes("sentry")) return "sentry";
  if (payload.rule_name || payload.ruleId || payload.AlarmRuleName || normalized["x-volc-trace-id"]) return "volcengine-cloudmonitor";
  if (payload.endpoint || payload.transaction || payload.duration_ms) return "apmplus";
  if (payload.url || payload.health_url || payload.status_code) return "external-health";
  return "manual";
}

function normalizeSeverity(value) {
  const raw = String(value || "").toLowerCase();
  if (/critical|fatal|p0|p1|high/.test(raw)) return "critical";
  if (/info|low|p3/.test(raw)) return "info";
  return "warning";
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "dry-run", "dry_run"].includes(raw);
}

function classifyAlert(alert = {}) {
  const payload = alert.payload || alert;
  const explicit = String(payload.alert_type || payload.type || "").toLowerCase();
  const known = new Set([
    "disk_high",
    "memory_high",
    "cpu_high",
    "o11y_agent_disconnected",
    "app_health_failed",
    "app_5xx",
    "coolify_deploy_failed",
    "sentry_code_error",
    "apm_slow_endpoint",
    "build_failed",
    "docker_cache",
    "simple_server_issue",
    "unknown",
  ]);
  if (known.has(explicit)) return explicit;
  const text = [
    alert.raw_summary,
    alert.raw_type,
    payload.metric_name,
    payload.metricName,
    payload.rule_name,
    payload.ruleName,
    payload.AlarmRuleName,
    payload.title,
    payload.message,
    payload.error,
    payload.status,
    payload.transaction,
    payload.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/sentry|exception|unhandled|stacktrace|code_error/.test(text) || alert.source === "sentry") return "sentry_code_error";
  if (/apm|slow|latency|duration|timeout|p95/.test(text) || alert.source === "apmplus") return "apm_slow_endpoint";
  if (/build|compile|next build|pnpm build/.test(text)) return "build_failed";
  if (/coolify.*(fail|failed|error)|deploy.*failed|deployment.*failed/.test(text)) return "coolify_deploy_failed";
  if (/health|unhealthy|probe|status[_ -]?code|http 5\d\d/.test(text)) return "app_health_failed";
  if (/(^|[^0-9])5\d\d([^0-9]|$)|bad gateway|gateway timeout|502|503|504/.test(text)) return "app_5xx";
  if (/disk|filesystem|df|volume|inode/.test(text)) return "disk_high";
  if (/docker.*cache|builder cache|image prune/.test(text)) return "docker_cache";
  if (/memory|mem|oom/.test(text)) return "memory_high";
  if (/cpu|load average|loadavg/.test(text)) return "cpu_high";
  if (/o11y|observability|agent.*disconnect|agent.*offline/.test(text)) return "o11y_agent_disconnected";
  return "unknown";
}

function normalizeAlert(payload = {}, headers = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  const source = detectSource(payload, headers);
  const traceId =
    normalizedHeaders["x-volc-trace-id"] ||
    normalizedHeaders["x-request-id"] ||
    payload.trace_id ||
    payload.traceId ||
    payload.event_id ||
    payload.id ||
    "";
  const summary = [
    payload.alert_type,
    payload.type,
    payload.rule_name,
    payload.ruleName,
    payload.AlarmRuleName,
    payload.title,
    payload.message,
    payload.reason,
    payload.metric_name,
    payload.metricName,
    payload.status,
    payload.error,
    payload.event,
    payload.transaction,
    payload.url,
  ]
    .filter(Boolean)
    .join(" ");
  const alert = {
    source,
    severity: normalizeSeverity(payload.severity || payload.level || payload.priority || payload.AlarmLevel),
    resource_id:
      payload.resource_id ||
      payload.resourceId ||
      payload.instance_id ||
      payload.InstanceId ||
      payload.resource ||
      payload.server ||
      payload.host ||
      payload.url ||
      "",
    trace_id: String(traceId || ""),
    created_at: payload.created_at || payload.createdAt || payload.StartTime || new Date().toISOString(),
    dry_run: parseBoolean(payload.dry_run ?? payload.dryRun ?? payload.dryrun),
    raw_summary: summary,
    raw_type: payload.alert_type || payload.type || payload.event || "",
    payload,
  };
  alert.alert_type = classifyAlert(alert);
  alert.incident_key = buildIncidentKey(alert);
  return alert;
}

function decideAutoopsPath(alert = {}) {
  const alertType = alert.alert_type || classifyAlert(alert);
  if (["disk_high", "docker_cache", "simple_server_issue", "o11y_agent_disconnected"].includes(alertType)) {
    return { path: "fast", runbook: alertType === "o11y_agent_disconnected" ? "restart-o11y" : "clean-disk" };
  }
  if (alertType === "app_health_failed") return { path: "fast", runbook: "coolify-restart" };
  if (alertType === "coolify_deploy_failed") return { path: "fast", runbook: "coolify-deploy" };
  if (["sentry_code_error", "build_failed", "app_5xx", "apm_slow_endpoint"].includes(alertType)) {
    return { path: "slow", runbook: "collect-evidence" };
  }
  return { path: "record", runbook: "diagnose" };
}

function dedupe(alert) {
  const now = Date.now();
  for (const [key, value] of seenIncidentKeys.entries()) {
    if (now - value > DEDUPE_TTL_MS) seenIncidentKeys.delete(key);
  }
  if (alert.trace_id && seenTraceIds.has(alert.trace_id)) return { duplicate: true, basis: "trace_id" };
  if (seenIncidentKeys.has(alert.incident_key)) return { duplicate: true, basis: "incident_key" };
  if (alert.trace_id) seenTraceIds.add(alert.trace_id);
  seenIncidentKeys.set(alert.incident_key, now);
  return { duplicate: false };
}

async function fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = DOWNSTREAM_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 400) };
      }
    }
    if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function repositoryDispatch(eventType, alert, decision) {
  const repo = process.env.AUTOOPS_REPO || "bei666qi-pan/VerseCraft";
  const [owner, name] = repo.split("/");
  const payload = compactDispatchPayload({ ...alert, runbook: decision.runbook });
  if (payload.runbook === undefined) delete payload.runbook;
  if (process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1") {
    logJson("github.repository_dispatch.dry_run", { repo, event_type: eventType, client_payload: payload });
    return { ok: true, dryRun: true, event_type: eventType };
  }
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required for GitHub repository_dispatch");
  await fetchJson(`https://api.github.com/repos/${owner}/${name}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VerseCraft-AutoOps",
    },
    body: { event_type: eventType, client_payload: payload },
  });
  return { ok: true, event_type: eventType };
}

function coolifyBaseCandidates() {
  const base = process.env.COOLIFY_BASE_URL;
  if (!base) return [];
  const clean = base.replace(/\/+$/g, "");
  return /\/api\/v\d+$/i.test(clean) ? [clean] : [`${clean}/api/v1`, clean];
}

async function coolifyRequest(path, { method = "GET", body } = {}) {
  if (!process.env.COOLIFY_API_KEY) throw new Error("COOLIFY_API_KEY is required for Coolify API calls");
  const bases = coolifyBaseCandidates();
  if (!bases.length) throw new Error("COOLIFY_BASE_URL is required for Coolify API calls");
  let lastError = null;
  for (const base of bases) {
    try {
      return await fetchJson(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${process.env.COOLIFY_API_KEY}`,
          "Content-Type": "application/json",
          "User-Agent": "VerseCraft-AutoOps",
        },
        body,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Coolify request failed");
}

async function coolifyRestart(uuid) {
  try {
    return await coolifyRequest(`/applications/${encodeURIComponent(uuid)}/restart`, { method: "GET" });
  } catch {
    return coolifyRequest(`/applications/${encodeURIComponent(uuid)}/restart`, { method: "POST" });
  }
}

async function coolifyDeploy(uuid) {
  const query = new URLSearchParams({ uuid, force: "true", instant_deploy: "true" });
  try {
    return await coolifyRequest(`/deploy?${query.toString()}`, { method: "GET" });
  } catch {
    return coolifyRequest(`/deploy?${query.toString()}`, { method: "POST" });
  }
}

function percentEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function signVolcRequest({ method, query, body = "", region, service = "ecs", ak, sk }) {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = iso.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": "application/json",
    host: VOLC_HOST,
    "x-content-sha256": payloadHash,
    "x-date": iso,
  };
  const signedHeaders = "host;x-content-sha256;x-date";
  const canonicalHeaders = `host:${VOLC_HOST}\nx-content-sha256:${payloadHash}\nx-date:${iso}\n`;
  const queryString = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const canonicalRequest = [method, "/", queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", iso, scope, sha256Hex(canonicalRequest)].join("\n");
  const signing = hmac(hmac(hmac(hmac(sk, shortDate), region), service), "request");
  const signature = hmac(signing, stringToSign, "hex");
  headers.Authorization = `HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers, queryString };
}

async function volcCall(action, body) {
  const ak = process.env.VOLC_AK;
  const sk = process.env.VOLC_SK;
  const region = process.env.VOLC_REGION || "cn-shanghai";
  if (!ak || !sk || !region) throw new Error("VOLC_AK, VOLC_SK, and VOLC_REGION are required");
  const requestBody = JSON.stringify(body || {});
  const query = { Action: action, Version: "2020-04-01" };
  const { headers, queryString } = signVolcRequest({ method: "POST", query, body: requestBody, region, ak, sk });
  return fetchJson(`${VOLC_ENDPOINT}/?${queryString}`, { method: "POST", headers, body: body || {} });
}

async function volcRunCommand(runbook) {
  const instanceIds = String(process.env.VOLC_ECS_INSTANCE_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!instanceIds.length) throw new Error("VOLC_ECS_INSTANCE_IDS is required for ECS fast path");
  const command =
    runbook === "restart-o11y"
      ? "if command -v o11yagentctl >/dev/null; then o11yagentctl restart || true; o11yagentctl ps || true; else systemctl restart o11yagent || true; systemctl status o11yagent --no-pager || true; fi"
      : "df -h; docker system df || true; docker builder prune -af --filter until=24h || true; docker image prune -af --filter until=168h || true; journalctl --vacuum-time=7d 2>/dev/null || true; df -h; docker system df || true";
  return volcCall("RunCommand", {
    RegionId: process.env.VOLC_REGION || "cn-shanghai",
    InstanceIds: instanceIds,
    CommandName: `versecraft-autoops-${runbook}`,
    CommandType: "Shell",
    CommandContent: Buffer.from(command, "utf8").toString("base64"),
    ContentEncoding: "Base64",
    Timeout: 90,
    Username: "root",
    WorkingDir: "/tmp",
  });
}

async function runFastPath(alert, decision) {
  if (process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1" || alert.dry_run === true) {
    return { ok: true, dryRun: true, action: decision.runbook };
  }
  if (decision.runbook === "coolify-restart") {
    if (!process.env.COOLIFY_APP_UUID) throw new Error("COOLIFY_APP_UUID is required");
    await coolifyRestart(process.env.COOLIFY_APP_UUID);
    return { ok: true, action: "coolify_restart" };
  }
  if (decision.runbook === "coolify-deploy") {
    if (!process.env.COOLIFY_APP_UUID) throw new Error("COOLIFY_APP_UUID is required");
    await coolifyDeploy(process.env.COOLIFY_APP_UUID);
    return { ok: true, action: "coolify_deploy" };
  }
  const runbook = decision.runbook === "restart-o11y" ? "restart-o11y" : "clean-disk";
  await volcRunCommand(runbook);
  return { ok: true, action: `volc_${runbook}` };
}

async function tryDispatch(eventType, alert, decision) {
  try {
    return await repositoryDispatch(eventType, alert, decision);
  } catch (error) {
    warnJson("alert_router.dispatch_failed", { incident_key: alert.incident_key, event_type: eventType, error: error.message });
    return { ok: false, event_type: eventType, error: error.message };
  }
}

async function executeRoute(alert, decision) {
  try {
    if (alert.dry_run === true) return await repositoryDispatch("autoops-record", alert, decision);
    if (decision.path === "fast") return await runFastPath(alert, decision);
    if (decision.path === "slow") return await repositoryDispatch("autoops-codex", alert, decision);
    return await repositoryDispatch("autoops-record", alert, decision);
  } catch (error) {
    warnJson("alert_router.route_failed_escalating", { incident_key: alert.incident_key, error: error.message });
    const escalation =
      decision.path === "slow"
        ? { ok: false, skipped: true, reason: "autoops-codex dispatch already failed" }
        : await tryDispatch("autoops-codex", { ...alert, alert_type: alert.alert_type || "unknown" }, decision);
    return { ok: false, error: error.message, escalated: Boolean(escalation.ok), escalation };
  }
}

function shouldWaitForDownstream() {
  return process.env.AUTOOPS_ALERT_ROUTER_WAIT_FOR_DOWNSTREAM === "1" || process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1";
}

function startBackgroundRoute(alert, decision) {
  setTimeout(async () => {
    const result = await executeRoute(alert, decision);
    logJson("alert_router.background_route_completed", { incident_key: alert.incident_key, result });
  }, 0);
  return { ok: true, accepted: true, mode: "background", runbook: decision.runbook, path: decision.path };
}

async function processAlert(event) {
  const secret = verifySecret(event);
  if (!secret.ok) return response(401, { ok: false, error: secret.reason });
  const headers = headersOf(event);
  const body = parseBody(event);
  const alert = normalizeAlert(body, headers);
  const duplicate = dedupe(alert);
  const decision = decideAutoopsPath(alert);
  const root = eventRoot(event);
  setTimeout(
    () =>
      logJson("alert_router.received", {
        incident_key: alert.incident_key,
        alert_type: alert.alert_type,
        decision,
        duplicate,
        event_shape: { root_keys: Object.keys(root).slice(0, 30) },
      }),
    0
  );
  if (duplicate.duplicate) return response(200, { ok: true, duplicate: true, incident_key: alert.incident_key });
  const started = Date.now();
  const routeResult = shouldWaitForDownstream() ? await executeRoute(alert, decision) : startBackgroundRoute(alert, decision);
  return response(200, {
    ok: true,
    incident_key: alert.incident_key,
    alert_type: alert.alert_type,
    path: decision.path,
    route_result: routeResult,
    elapsed_ms: Date.now() - started,
  });
}

exports.handler = async function handler(event, context = {}) {
  try {
    if (context && typeof context === "object" && "callbackWaitsForEmptyEventLoop" in context) {
      context.callbackWaitsForEmptyEventLoop = false;
    }
  } catch {}
  try {
    return await processAlert(event);
  } catch (error) {
    warnJson("alert_router.unhandled_error", { error: error.message });
    return response(200, { ok: false, error: "alert_router_internal_error", message: error.message });
  }
};

async function startServer() {
  const port = Number(process.env.PORT || 8787);
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const result = await exports.handler({
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  });
  server.listen(port, () => logJson("alert_router.server_started", { port }));
}

if (process.argv.includes("--self-test")) {
  process.env.AUTOOPS_ALERT_ROUTER_SECRET = "test-secret";
  process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN = "1";
  exports
    .handler({
      headers: { "x-autoops-secret": "test-secret", "x-volc-trace-id": "self-test" },
      body: JSON.stringify({ source: "external-health", alert_type: "app_health_failed", resource_id: "self-test" }),
    })
    .then((result) => console.log(result.body));
} else if (require.main === module) {
  startServer();
}
