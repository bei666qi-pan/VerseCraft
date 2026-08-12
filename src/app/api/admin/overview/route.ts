import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getBackofficeOverview } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getBackofficeOverview(range);
  return data;
}, {
  label: "overview",
  cacheSeconds: 20,
  staleWhileRevalidate: 20,
  onError: (_, ctx) => {
    const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
    return {
      reason: "overview_unavailable",
      fallback: {
        range,
        cards: { todayNewUsers: 0, totalUsers: 0, totalTokens: 0, todayTokenCost: 0, dau: 0, wau: 0, mau: 0, feedbackCountRange: 0, playDurationRangeSec: 0 },
        kpis: [],
        chartData: [],
        updatedAt: new Date().toISOString(),
      },
      cacheSeconds: 5,
    };
  },
});
