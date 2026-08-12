import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getFunnelMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getFunnelMetrics(range);
  return data;
}, { label: "funnel", cacheSeconds: 60, staleWhileRevalidate: 120, errorReason: "funnel_unavailable" });
