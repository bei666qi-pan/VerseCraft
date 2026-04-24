// src/lib/admin/parseAdminEnvelope.ts
import type { AdminApiEnvelope } from "./apiEnvelope";

/**
 * Client-side: parse new envelope or legacy body (treated as full payload in `data`).
 */
export function parseAdminEnvelope<T>(raw: unknown): AdminApiEnvelope<T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, data: null, degraded: true, reason: "invalid_response" };
  }
  const o = raw as Record<string, unknown>;
  if ("ok" in o && typeof o.ok === "boolean" && "data" in o) {
    return {
      ok: o.ok,
      data: (o.data as T) ?? null,
      degraded: Boolean(o.degraded),
      reason: typeof o.reason === "string" ? o.reason : o.reason == null ? null : String(o.reason),
    };
  }
  return { ok: true, data: raw as T, degraded: false, reason: null };
}

export async function readAdminResponseJson<T>(res: Response): Promise<AdminApiEnvelope<T>> {
  const raw = await res.json().catch(() => null);
  return parseAdminEnvelope<T>(raw);
}
