import { createHmac, randomUUID } from "node:crypto";

const ADMIN_COOKIE_NAME = "admin_shadow_session";

export function buildAdminSessionCookie(adminPassword, options = {}) {
  const password = String(adminPassword ?? "").trim();
  if (!password) throw new Error("adminPassword is required");
  const nowMs = Number(options.nowMs ?? Date.now());
  const nonce = String(options.nonce ?? randomUUID().replaceAll("-", ""));
  const expiresAt = Math.floor(nowMs / 1000) + 10 * 60;
  const payload = `${expiresAt}.${nonce}`;
  const signature = createHmac("sha256", password).update(payload).digest("base64url");
  return `${ADMIN_COOKIE_NAME}=${payload}.${signature}`;
}

export function assessAdminOverviewResponse(status, payload) {
  if (status !== 200) return { ok: false, reason: `admin_http_${status}` };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "admin_payload_not_object" };
  }
  if (payload.ok !== true) return { ok: false, reason: "admin_ok_not_true" };
  if (payload.degraded === true) return { ok: false, reason: "admin_degraded" };
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "admin_data_missing" };
  }
  if (!("cards" in data) || !("range" in data)) {
    return { ok: false, reason: "admin_overview_contract_missing" };
  }
  return { ok: true, reason: null };
}

export async function verifyProductionAdmin({ baseUrl, adminPassword, fetchImpl = globalThis.fetch }) {
  const url = new URL("/api/admin/overview?range=today", baseUrl);
  url.searchParams.set("deploy_check", String(Date.now()));
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Cookie: buildAdminSessionCookie(adminPassword),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: "admin_response_not_json", status: response.status };
  }
  return { ...assessAdminOverviewResponse(response.status, payload), status: response.status };
}
