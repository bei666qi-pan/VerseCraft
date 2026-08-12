import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getOverviewMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getOverviewMetrics(range);
  return {
    totalUsers: data.cards.totalUsers,
    totalTokens: data.cards.totalTokens,
    chartData: data.chartData,
    range: data.range,
  };
}, { label: "stats", cacheSeconds: 30, staleWhileRevalidate: 60, errorReason: "stats_unavailable" });
