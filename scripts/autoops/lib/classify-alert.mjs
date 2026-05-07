import { buildIncidentKey } from "./incident-key.mjs";

const ALERT_TYPES = new Set([
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

export function normalizeHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
}

export function detectSource(payload = {}, headers = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  const explicit =
    payload.source ||
    payload.alert_source ||
    payload.platform ||
    normalizedHeaders["x-autoops-source"] ||
    normalizedHeaders["x-alert-source"];
  if (explicit) {
    return String(explicit).toLowerCase();
  }
  const userAgent = String(normalizedHeaders["user-agent"] || "").toLowerCase();
  if (payload.event || payload.project || payload.issue || userAgent.includes("sentry")) {
    return "sentry";
  }
  if (payload.rule_name || payload.ruleId || payload.AlarmRuleName || normalizedHeaders["x-volc-trace-id"]) {
    return "volcengine-cloudmonitor";
  }
  if (payload.endpoint || payload.transaction || payload.duration_ms) {
    return "apmplus";
  }
  if (payload.url || payload.health_url || payload.status_code) {
    return "external-health";
  }
  return "manual";
}

export function normalizeAlert(payload = {}, headers = {}) {
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

  const normalized = {
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
  normalized.alert_type = classifyAlert(normalized);
  normalized.incident_key = buildIncidentKey(normalized);
  return normalized;
}

export function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "dry-run", "dry_run"].includes(raw);
}

export function normalizeSeverity(value) {
  const raw = String(value || "").toLowerCase();
  if (/critical|fatal|p0|p1|high|紧急|严重/.test(raw)) {
    return "critical";
  }
  if (/warning|warn|medium|p2|告警|警告/.test(raw)) {
    return "warning";
  }
  if (/info|low|p3|通知/.test(raw)) {
    return "info";
  }
  return "warning";
}

export function classifyAlert(alert = {}) {
  const payload = alert.payload || alert;
  const text = [
    alert.raw_summary,
    alert.raw_type,
    payload.alert_type,
    payload.type,
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

  const explicit = String(payload.alert_type || payload.type || "").toLowerCase();
  if (ALERT_TYPES.has(explicit)) {
    return explicit;
  }
  if (/sentry|exception|unhandled|stacktrace|code_error|代码|异常/.test(text) || alert.source === "sentry") {
    return "sentry_code_error";
  }
  if (/apm|slow|latency|duration|timeout|p95|接口慢|慢接口/.test(text) || alert.source === "apmplus") {
    return "apm_slow_endpoint";
  }
  if (/build|compile|next build|pnpm build|构建/.test(text)) {
    return "build_failed";
  }
  if (/coolify.*(fail|failed|error)|deploy.*failed|deployment.*failed|部署失败/.test(text)) {
    return "coolify_deploy_failed";
  }
  if (/health|健康|unhealthy|probe|status[_ -]?code|http 5\d\d/.test(text)) {
    return "app_health_failed";
  }
  if (/(^|[^0-9])5\d\d([^0-9]|$)|bad gateway|gateway timeout|502|503|504/.test(text)) {
    return "app_5xx";
  }
  if (/disk|filesystem|df|磁盘|硬盘|volume|inode/.test(text)) {
    return "disk_high";
  }
  if (/docker.*cache|builder cache|image prune/.test(text)) {
    return "docker_cache";
  }
  if (/memory|mem|oom|内存/.test(text)) {
    return "memory_high";
  }
  if (/cpu|load average|loadavg|处理器/.test(text)) {
    return "cpu_high";
  }
  if (/o11y|observability|agent.*disconnect|agent.*offline|采集.*离线|探针.*断开/.test(text)) {
    return "o11y_agent_disconnected";
  }
  return "unknown";
}

export function decideAutoopsPath(alert = {}) {
  const alertType = alert.alert_type || classifyAlert(alert);
  if (["disk_high", "docker_cache", "simple_server_issue", "o11y_agent_disconnected"].includes(alertType)) {
    return { path: "fast", runbook: alertType === "o11y_agent_disconnected" ? "restart-o11y" : "clean-disk" };
  }
  if (alertType === "app_health_failed") {
    return { path: "fast", runbook: "coolify-restart" };
  }
  if (alertType === "coolify_deploy_failed") {
    return { path: "fast", runbook: "coolify-deploy" };
  }
  if (["sentry_code_error", "build_failed", "app_5xx", "apm_slow_endpoint"].includes(alertType)) {
    return { path: "slow", runbook: "collect-evidence" };
  }
  return { path: "record", runbook: "diagnose" };
}
