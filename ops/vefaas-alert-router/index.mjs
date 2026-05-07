import http from "node:http";
import { pathToFileURL } from "node:url";
import { normalizeAlert, decideAutoopsPath } from "../../scripts/autoops/lib/classify-alert.mjs";
import { compactDispatchPayload } from "../../scripts/autoops/lib/incident-key.mjs";
import { GitHubClient } from "../../scripts/autoops/lib/github.mjs";
import { CoolifyClient } from "../../scripts/autoops/lib/coolify.mjs";
import { VolcEcsClient } from "../../scripts/autoops/lib/volc-openapi.mjs";
import { logJson, warnJson } from "../../scripts/autoops/lib/logger.mjs";

const seenTraceIds = new Set();
const seenIncidentKeys = new Map();
const DEDUPE_TTL_MS = Number(process.env.AUTOOPS_ALERT_DEDUPE_TTL_MS || 5 * 60 * 1000);
const DEFAULT_DOWNSTREAM_TIMEOUT_MS = 1200;

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
  const raw = root.body ?? root.Body ?? "";
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
  if (!raw) return {};
  return Object.fromEntries(new URLSearchParams(String(raw)));
}

function getSecret(headers, query) {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
  const headerSecret = Array.isArray(normalizedHeaders["x-autoops-secret"])
    ? normalizedHeaders["x-autoops-secret"][0]
    : normalizedHeaders["x-autoops-secret"];
  const headerRouterSecret = Array.isArray(normalizedHeaders["x-alert-router-secret"])
    ? normalizedHeaders["x-alert-router-secret"][0]
    : normalizedHeaders["x-alert-router-secret"];
  const authorization = Array.isArray(normalizedHeaders.authorization)
    ? normalizedHeaders.authorization[0]
    : normalizedHeaders.authorization;
  return (
    query.secret ||
    query.autoops_secret ||
    headerSecret ||
    headerRouterSecret ||
    authorization?.replace(/^Bearer\s+/i, "")
  );
}

function verifySecret(event) {
  const expected = process.env.AUTOOPS_ALERT_ROUTER_SECRET;
  if (!expected) {
    return { ok: false, reason: "AUTOOPS_ALERT_ROUTER_SECRET is not configured" };
  }
  const actual = getSecret(headersOf(event), queryOf(event));
  if (!actual || actual !== expected) {
    return { ok: false, reason: "invalid secret" };
  }
  return { ok: true };
}

function dedupe(alert) {
  const now = Date.now();
  for (const [key, value] of seenIncidentKeys.entries()) {
    if (now - value > DEDUPE_TTL_MS) {
      seenIncidentKeys.delete(key);
    }
  }
  if (alert.trace_id && seenTraceIds.has(alert.trace_id)) {
    return { duplicate: true, basis: "trace_id" };
  }
  if (seenIncidentKeys.has(alert.incident_key)) {
    return { duplicate: true, basis: "incident_key" };
  }
  if (alert.trace_id) {
    seenTraceIds.add(alert.trace_id);
  }
  seenIncidentKeys.set(alert.incident_key, now);
  return { duplicate: false };
}

function downstreamTimeoutMs() {
  const value = Number(process.env.AUTOOPS_ALERT_ROUTER_DOWNSTREAM_TIMEOUT_MS || DEFAULT_DOWNSTREAM_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DOWNSTREAM_TIMEOUT_MS;
}

function shouldWaitForDownstream() {
  return process.env.AUTOOPS_ALERT_ROUTER_WAIT_FOR_DOWNSTREAM === "1" || process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1";
}

async function withDeadline(promise, timeoutMs = downstreamTimeoutMs()) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("downstream trigger timeout")), timeoutMs)),
  ]);
}

async function runFastPath(alert, decision) {
  const dryRun = process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1" || alert.dry_run === true;
  if (decision.runbook === "coolify-restart") {
    const uuid = process.env.COOLIFY_APP_UUID;
    if (!uuid) throw new Error("COOLIFY_APP_UUID is required for coolify restart fast path");
    const client = new CoolifyClient({ dryRun, requestTimeoutMs: downstreamTimeoutMs() });
    await client.restart(uuid);
    return { ok: true, action: "coolify_restart" };
  }
  if (decision.runbook === "coolify-deploy") {
    const uuid = process.env.COOLIFY_APP_UUID;
    if (!uuid) throw new Error("COOLIFY_APP_UUID is required for coolify deploy fast path");
    const client = new CoolifyClient({ dryRun, requestTimeoutMs: downstreamTimeoutMs() });
    await client.deploy(uuid, { force: true, instant: true });
    return { ok: true, action: "coolify_deploy" };
  }
  const instanceIds = String(process.env.VOLC_ECS_INSTANCE_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!instanceIds.length) {
    throw new Error("VOLC_ECS_INSTANCE_IDS is required for ECS fast path");
  }
  const runbook = decision.runbook === "restart-o11y" ? "restart-o11y" : "clean-disk";
  const command =
    runbook === "restart-o11y"
      ? "if command -v o11yagentctl >/dev/null; then o11yagentctl restart || true; o11yagentctl ps || true; else systemctl restart o11yagent || true; systemctl status o11yagent --no-pager || true; fi"
      : "df -h; docker system df || true; docker builder prune -af --filter until=24h || true; docker image prune -af --filter until=168h || true; journalctl --vacuum-time=7d 2>/dev/null || true; df -h; docker system df || true";
  const client = new VolcEcsClient({ dryRun, timeoutMs: downstreamTimeoutMs() });
  await client.runCommand({ instanceIds, command, commandName: `versecraft-autoops-${runbook}`, timeout: 90 });
  return { ok: true, action: `volc_${runbook}` };
}

async function dispatch(eventType, alert, decision) {
  const dryRun = process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1";
  const client = new GitHubClient({ dryRun, timeoutMs: downstreamTimeoutMs() });
  const payload = compactDispatchPayload({ ...alert, runbook: decision.runbook });
  await client.repositoryDispatch(eventType, payload);
  return { ok: true, event_type: eventType };
}

async function tryDispatch(eventType, alert, decision) {
  try {
    return await dispatch(eventType, alert, decision);
  } catch (error) {
    warnJson("alert_router.dispatch_failed", {
      incident_key: alert.incident_key,
      event_type: eventType,
      error: error.message,
    });
    return { ok: false, event_type: eventType, error: error.message };
  }
}

async function executeRoute(alert, decision) {
  try {
    if (alert.dry_run === true) {
      return await withDeadline(dispatch("autoops-record", alert, decision));
    }
    if (decision.path === "fast") {
      return await withDeadline(runFastPath(alert, decision));
    }
    if (decision.path === "slow") {
      return await withDeadline(dispatch("autoops-codex", alert, decision));
    }
    return await withDeadline(dispatch("autoops-record", alert, decision));
  } catch (error) {
    warnJson("alert_router.route_failed_escalating", { incident_key: alert.incident_key, error: error.message });
    const escalation =
      decision.path === "slow"
        ? { ok: false, skipped: true, reason: "autoops-codex dispatch already failed" }
        : await tryDispatch("autoops-codex", { ...alert, alert_type: alert.alert_type || "unknown" }, decision);
    return {
      ok: false,
      error: error.message,
      escalated: Boolean(escalation.ok),
      escalation,
    };
  }
}

function startBackgroundRoute(alert, decision) {
  setTimeout(async () => {
    const result = await executeRoute(alert, decision);
    logJson("alert_router.background_route_completed", {
      incident_key: alert.incident_key,
      result,
    });
  }, 0);
  return {
    ok: true,
    accepted: true,
    mode: "background",
    runbook: decision.runbook,
    path: decision.path,
  };
}

async function processAlert(event) {
  const secret = verifySecret(event);
  if (!secret.ok) {
    return response(401, { ok: false, error: secret.reason });
  }
  const headers = headersOf(event);
  const body = parseBody(event);
  const alert = normalizeAlert(body, headers);
  const duplicate = dedupe(alert);
  const decision = decideAutoopsPath(alert);
  const root = eventRoot(event);
  setTimeout(() => logJson("alert_router.received", { alert, decision, duplicate, event_shape: { root_keys: Object.keys(root).slice(0, 30) } }), 0);
  if (duplicate.duplicate) {
    return response(200, { ok: true, duplicate: true, incident_key: alert.incident_key });
  }

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

export async function handler(event, context = {}) {
  try {
    if (context && typeof context === "object" && "callbackWaitsForEmptyEventLoop" in context) {
      context.callbackWaitsForEmptyEventLoop = false;
    }
  } catch {
    // Some veFaaS context implementations are read-only; this flag is only an optimization.
  }
  try {
    return await processAlert(event);
  } catch (error) {
    warnJson("alert_router.unhandled_error", { error: error.message });
    return response(200, {
      ok: false,
      error: "alert_router_internal_error",
      message: error.message,
    });
  }
}

async function startServer() {
  const port = Number(process.env.PORT || 8787);
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const event = {
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: Buffer.concat(chunks).toString("utf8"),
    };
    const result = await handler(event, {});
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  });
  server.listen(port, () => logJson("alert_router.server_started", { port }));
}

if (process.argv.includes("--self-test")) {
  const secret = "test-secret";
  process.env.AUTOOPS_ALERT_ROUTER_SECRET = secret;
  process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN = "1";
  process.env.COOLIFY_APP_UUID = process.env.COOLIFY_APP_UUID || "dry-run-app";
  const result = await handler({
    headers: { "x-autoops-secret": secret, "x-volc-trace-id": "self-test" },
    body: JSON.stringify({ source: "external-health", alert_type: "app_health_failed", resource_id: "self-test" }),
  });
  console.log(result.body);
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
