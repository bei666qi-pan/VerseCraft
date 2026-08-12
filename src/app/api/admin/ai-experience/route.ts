import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getAiExperienceMetrics } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getAiExperienceMetrics(range);
  const degraded = data.evidenceSufficiency === "insufficient";
  return { data, degraded, reason: degraded ? "insufficient_sample" : null };
}, {
  label: "ai-experience",
  cacheSeconds: 60,
  staleWhileRevalidate: 120,
  onError: (_, ctx) => {
    const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
    return {
      reason: "ai_experience_unavailable",
      fallback: {
        range, sampleSize: 0, evidenceSufficiency: "insufficient", metrics: [],
        rates: { successRate: 0, failureRate: 0, fallbackRate: 0, parseFailureRate: 0, queueWait: { p50: null, p95: null, status: "unavailable" } },
        cost: { totalTokens: 0, tokenPerEffectiveAction: 0, tokenPerActiveActor: 0, highCostActors: [] },
        anomalies: ["ai_experience_unavailable"],
        updatedAt: new Date().toISOString(),
      },
      cacheSeconds: 10,
    };
  },
});
