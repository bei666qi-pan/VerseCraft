import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { buildSurveyAggregateReport } from "@/lib/admin/surveyAggregate";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getSurveyAggregate } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getSurveyAggregate(range);
  const degraded = data.evidenceSufficiency === "insufficient";
  return { data, degraded, reason: degraded ? "insufficient_sample" : null };
}, {
  label: "survey-aggregate",
  cacheSeconds: 120,
  staleWhileRevalidate: 300,
  onError: (_, ctx) => {
    const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
    return {
      reason: "survey_aggregate_unavailable",
      fallback: buildSurveyAggregateReport(range, [], []),
      cacheSeconds: 10,
    };
  },
});
