// src/lib/admin/apiEnvelope.ts
import { NextResponse } from "next/server";

export type AdminApiEnvelope<T> = {
  ok: boolean;
  data: T | null;
  /** True when the response is usable but incomplete, or when ok is false. */
  degraded: boolean;
  reason: string | null;
};

export function adminOk<T>(data: T, opts?: { degraded?: boolean; reason?: string | null }): AdminApiEnvelope<T> {
  return {
    ok: true,
    data,
    degraded: Boolean(opts?.degraded),
    reason: opts?.reason ?? null,
  };
}

export function adminFail<T = null>(reason: string, data: T | null = null): AdminApiEnvelope<T> {
  return { ok: false, data, degraded: true, reason };
}

/**
 * JSON body for /api/admin/* — prefer HTTP 200 + envelope so the dashboard can always parse.
 * Use status 403 only for auth failure (client redirects to re-login).
 */
export function adminJson<T>(body: AdminApiEnvelope<T>, init?: ResponseInit): NextResponse {
  const { status, ...rest } = init ?? {};
  return NextResponse.json(body, { ...rest, status: status ?? 200 });
}

/** 403: shadow cookie 无效；响应体与通用信封一致。 */
export function adminUnauthorizedJson(): NextResponse {
  return adminJson(adminFail<null>("unauthorized", null), { status: 403 });
}
