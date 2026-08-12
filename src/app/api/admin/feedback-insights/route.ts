import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getFeedbackInsights } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getFeedbackInsights(range);
  return data;
}, { label: "feedback-insights", cacheSeconds: 120, staleWhileRevalidate: 300, errorReason: "feedback_insights_unavailable" });
