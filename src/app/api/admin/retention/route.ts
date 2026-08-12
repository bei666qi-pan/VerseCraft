import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getRetentionMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getRetentionMetrics(range);
  return data;
}, { label: "retention", cacheSeconds: 120, staleWhileRevalidate: 300, errorReason: "retention_unavailable" });
