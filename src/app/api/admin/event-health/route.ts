import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { buildEmptyEventHealthMetrics, getEventHealthMetrics } from "@/lib/admin/eventHealthMetrics";
import { clamp } from "@/lib/clamp";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? clamp(Math.trunc(parsed), 1, 100) : 20;
}

export const GET = createAdminRoute(async (ctx) => {
  const url = new URL(ctx.req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  const limit = parseLimit(url.searchParams.get("limit"));
  const data = await getEventHealthMetrics(range, { limit });
  const degraded = data.evidenceSufficiency === "insufficient";
  return { data, degraded, reason: degraded ? "insufficient_sample" : null };
}, {
  label: "event-health",
  cacheSeconds: 60,
  staleWhileRevalidate: 120,
  onError: (_, ctx) => {
    const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
    return { reason: "event_health_unavailable", fallback: buildEmptyEventHealthMetrics(range), cacheSeconds: 10 };
  },
});
