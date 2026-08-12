// src/lib/admin/adminRouteFactory.ts
import "server-only";

import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest, type AdminActor } from "@/lib/admin/authGuard";

/** 已鉴权上下文，handler 拿到它时表示 guard 已通过。 */
export type AdminRouteContext = {
  guard: AdminActor;
  req: Request;
};

/**
 * handler 返回 T（纯数据 → adminOk(data)）。
 * 需要 degraded/reason 时返回 `{ data: T; degraded?: boolean; reason?: string | null }`。
 */
export type AdminRouteResult<T> =
  | T
  | { data: T; degraded?: boolean; reason?: string | null };

function isDataEnvelope<T>(value: unknown): value is { data: T; degraded?: boolean; reason?: string | null } {
  return value !== null && typeof value === "object" && "data" in (value as Record<string, unknown>);
}

function cacheControl(maxAge: number, swr?: number): string {
  return swr != null
    ? `private, max-age=${maxAge}, stale-while-revalidate=${swr}`
    : `private, max-age=${maxAge}`;
}

export type CreateAdminRouteOpts = {
  /** 控制台日志标签，如 "stats", "retention"。默认 "admin"。 */
  label?: string;
  /** 成功响应 Cache-Control max-age（秒）。0 表示不设 Cache-Control。 */
  cacheSeconds?: number;
  /** stale-while-revalidate 秒数，默认 0（不设）。 */
  staleWhileRevalidate?: number;
  /** catch 时使用的 reason，默认 `${label}_unavailable`。 */
  errorReason?: string;
  /** catch 错误时响应的 Cache-Control max-age，默认 5。 */
  errorCacheSeconds?: number;
};

/**
 * 创建标准 admin API route handler。
 *
 * 自动封装：verifyAdminRequest → try/catch → console.error → adminJson。
 * handler 只需关心业务逻辑：
 *
 * @example 简单 GET
 *   export const GET = createAdminRoute(async (ctx) => {
 *     const data = await getMetrics();
 *     return data;
 *   }, { label: "my-metrics", cacheSeconds: 30 });
 *
 * @example 带 degraded
 *   export const GET = createAdminRoute(async (ctx) => {
 *     const data = await getHealth();
 *     const degraded = Object.values(data.checks).some(c => c.degraded);
 *     return { data, degraded, reason: degraded ? "degraded" : null };
 *   }, { label: "health", cacheSeconds: 15 });
 *
 * @example 自定义 error handler（需要特殊 fallback 数据时）
 *   export const GET = createAdminRoute(async (ctx) => {
 *     // business logic
 *   }, {
 *     label: "my-analytics",
 *     cacheSeconds: 60,
 *     onError: (error, ctx) => ({
 *       reason: "my_analytics_unavailable",
 *       fallback: { metrics: [], sampleSize: 0 },
 *       cacheSeconds: 10,
 *     }),
 *   });
 */
export function createAdminRoute<T>(
  handler: (ctx: AdminRouteContext) => Promise<AdminRouteResult<T>>,
  opts: CreateAdminRouteOpts & {
    onError?: (error: unknown, ctx: AdminRouteContext) => { reason: string; fallback?: unknown; cacheSeconds?: number };
  } = {}
): (req: Request) => Promise<Response> {
  const label = opts.label ?? "admin";
  const errorReason = opts.errorReason ?? `${label}_unavailable`;
  const errorCacheS = opts.errorCacheSeconds ?? 5;

  return async function adminRouteHandler(req: Request): Promise<Response> {
    const guard = await verifyAdminRequest(req);
    if (!guard.ok) return guard.response;

    const ctx: AdminRouteContext = { guard: guard.actor, req };

    try {
      const result = await handler(ctx);

      const envelopeData = isDataEnvelope<T>(result) ? result : { data: result as T };
      const degraded = envelopeData.degraded ?? false;
      const reason = envelopeData.reason ?? null;

      const headers: Record<string, string> = {};
      if (opts.cacheSeconds && opts.cacheSeconds > 0) {
        headers["Cache-Control"] = cacheControl(opts.cacheSeconds, opts.staleWhileRevalidate);
      }

      return adminJson(adminOk(envelopeData.data, { degraded, reason }), { headers });
    } catch (error) {
      console.error(`[api/admin/${label}] failed`, error);

      if (opts.onError) {
        const custom = opts.onError(error, ctx);
        const fallback = custom.fallback ?? null;
        const cSeconds = custom.cacheSeconds ?? errorCacheS;
        return adminJson(adminFail(custom.reason, fallback), {
          status: 200,
          headers: { "Cache-Control": cacheControl(cSeconds) },
        });
      }

      return adminJson(adminFail<null>(errorReason, null), {
        status: 200,
        headers: { "Cache-Control": cacheControl(errorCacheS) },
      });
    }
  };
}
