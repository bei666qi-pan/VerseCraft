import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getNorthStarMetrics } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getNorthStarMetrics(range);
  return data;
}, {
  label: "north-star",
  cacheSeconds: 30,
  staleWhileRevalidate: 60,
  onError: (_, ctx) => {
    const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
    return {
      reason: "north_star_unavailable",
      fallback: { range, northStar: null, inputMetrics: [], updatedAt: new Date().toISOString() },
      cacheSeconds: 10,
    };
  },
});
