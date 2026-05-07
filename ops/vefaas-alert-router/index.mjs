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

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event) return {};
  const raw = event.body ?? event.Body ?? "";
  if (!raw) return {};
  const text = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : String(raw);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2048) };
  }
}

function headersOf(event) {
  return event?.headers || event?.Headers || {};
}

function queryOf(event) {
  return event?.queryStringParameters || event?.query || event?.Query || {};
}

function getSecret(headers, query) {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
  return (
    query.secret ||
    query.autoops_secret ||
    normalizedHeaders["x-autoops-secret"] ||
    normalizedHeaders["x-alert-router-secret"] ||
    normalizedHeaders.authorization?.replace(/^Bearer\s+/i, "")
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

async function runFastPath(alert, decision) {
  const dryRun = process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1";
  if (decision.runbook === "coolify-restart") {
    const uuid = process.env.COOLIFY_APP_UUID;
    if (!uuid) throw new Error("COOLIFY_APP_UUID is required for coolify restart fast path");
    const client = new CoolifyClient({ dryRun });
    await client.restart(uuid);
    return { ok: true, action: "coolify_restart" };
  }
  if (decision.runbook === "coolify-deploy") {
    const uuid = process.env.COOLIFY_APP_UUID;
    if (!uuid) throw new Error("COOLIFY_APP_UUID is required for coolify deploy fast path");
    const client = new CoolifyClient({ dryRun });
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
  const client = new VolcEcsClient({ dryRun });
  await client.runCommand({ instanceIds, command, commandName: `versecraft-autoops-${runbook}`, timeout: 90 });
  return { ok: true, action: `volc_${runbook}` };
}

async function dispatch(eventType, alert, decision) {
  const dryRun = process.env.AUTOOPS_ALERT_ROUTER_DRY_RUN === "1";
  const client = new GitHubClient({ dryRun });
  const payload = compactDispatchPayload({ ...alert, runbook: decision.runbook });
  await client.repositoryDispatch(eventType, payload);
  return { ok: true, event_type: eventType };
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
  logJson("alert_router.received", { alert, decision, duplicate });
  if (duplicate.duplicate) {
    return response(200, { ok: true, duplicate: true, incident_key: alert.incident_key });
  }

  const started = Date.now();
  let routeResult = null;
  try {
    if (decision.path === "fast") {
      routeResult = await Promise.race([
        runFastPath(alert, decision),
        new Promise((_, reject) => setTimeout(() => reject(new Error("fast path trigger timeout")), 900)),
      ]);
    } else if (decision.path === "slow") {
      routeResult = await dispatch("autoops-codex", alert, decision);
    } else {
      routeResult = await dispatch("autoops-record", alert, decision);
    }
  } catch (error) {
    warnJson("alert_router.fast_path_failed_escalating", { incident_key: alert.incident_key, error: error.message });
    routeResult = await dispatch("autoops-codex", { ...alert, alert_type: alert.alert_type || "unknown" }, decision);
  }

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
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }
  return processAlert(event);
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
