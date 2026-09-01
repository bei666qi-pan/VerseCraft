// src/lib/api/publicEnvelope.ts
//
// 公开 API envelope（无鉴权场景）：与 src/lib/admin/apiEnvelope.ts 同形，
// 但不复用 adminJson 以避免 admin 鉴权耦合。
//
// 用法：/api/leaderboard、未来的 /api/feedback/history 等。
// 失败时仍返回 HTTP 200 + envelope，便于前端始终能解析。

import { NextResponse } from "next/server";

export type PublicApiEnvelope<T> = {
  ok: boolean;
  data: T | null;
  /** True when the response is usable but incomplete, or when ok is false. */
  degraded: boolean;
  reason: string | null;
};

export function publicOk<T>(
  data: T,
  opts?: { degraded?: boolean; reason?: string | null }
): PublicApiEnvelope<T> {
  return {
    ok: true,
    data,
    degraded: Boolean(opts?.degraded),
    reason: opts?.reason ?? null,
  };
}

export function publicFail<T = null>(
  reason: string,
  data: T | null = null
): PublicApiEnvelope<T> {
  return { ok: false, data, degraded: true, reason };
}

/**
 * JSON body for /api/public/* — prefer HTTP 200 + envelope so the client can always parse.
 */
export function publicJson<T>(
  body: PublicApiEnvelope<T>,
  init?: ResponseInit
): NextResponse<PublicApiEnvelope<T>> {
  const { status, ...rest } = init ?? {};
  return NextResponse.json(body, { ...rest, status: status ?? 200 }) as NextResponse<PublicApiEnvelope<T>>;
}