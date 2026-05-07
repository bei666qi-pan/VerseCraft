import crypto from "node:crypto";

export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function shortHash(value, length = 12) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

export function safeSegment(value, fallback = "unknown") {
  const segment = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return segment || fallback;
}

export function buildIncidentKey(input = {}) {
  const source = safeSegment(input.source);
  const alertType = safeSegment(input.alert_type || input.alertType || input.type);
  const resourceId = safeSegment(input.resource_id || input.resourceId || input.resource || input.instance_id);
  const traceId = input.trace_id || input.traceId || "";
  const basis = {
    source,
    alertType,
    resourceId,
    traceId,
    fingerprint: input.fingerprint || input.event_id || input.id || "",
  };
  return `${source}:${alertType}:${resourceId}:${shortHash(stableJson(basis), 10)}`;
}

export function compactDispatchPayload(input = {}) {
  const payload = {
    incident_key: input.incident_key || buildIncidentKey(input),
    source: input.source || "unknown",
    severity: input.severity || "warning",
    resource_id: input.resource_id || input.resourceId || input.resource || "",
    alert_type: input.alert_type || input.alertType || input.type || "unknown",
    trace_id: input.trace_id || input.traceId || "",
    created_at: input.created_at || input.createdAt || new Date().toISOString(),
  };
  if (input.action) {
    payload.action = input.action;
  }
  if (input.runbook) {
    payload.runbook = input.runbook;
  }
  return payload;
}

export function assertDispatchPayloadSmall(payload) {
  const keys = Object.keys(payload);
  if (keys.length > 10) {
    throw new Error(`repository_dispatch client_payload has ${keys.length} top-level fields; limit is 10`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > 64 * 1024) {
    throw new Error(`repository_dispatch client_payload is ${bytes} bytes; limit is 64KB`);
  }
  return { keys: keys.length, bytes };
}
