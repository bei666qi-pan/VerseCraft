import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getContentQualityMetrics } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
  const data = await getContentQualityMetrics(range);
  const degraded = data.evidenceSufficiency === "insufficient";
  return { data, degraded, reason: degraded ? "insufficient_sample" : null };
}, {
  label: "content-quality",
  cacheSeconds: 120,
  staleWhileRevalidate: 240,
  onError: (_, ctx) => {
    const range = parseAdminTimeRangeFromSearchParams(new URL(ctx.req.url).searchParams);
    return {
      reason: "content_quality_unavailable",
      fallback: {
        range, sampleSize: 0, evidenceSufficiency: "insufficient",
        worldSelections: [], worldFirstActionRate: 0,
        chapters: { entered: [], completed: [], abandoned: [], rank: [], completionRate: 0, abandonRate: 0, evidenceSufficiency: "insufficient" },
        npcInteractions: { rank: [], completionRate: 0, failureRate: 0 },
        validatorIssues: { total: 0, byCode: [] },
        validatorIssueCount: 0, retryRegenerationCount: 0,
        retryRegeneration: { retryCount: 0, regenCount: 0, total: 0 },
        feedbackTopics: [], feedbackSampleSize: 0, negativeFeedbackRate: 0,
        surveySampleSize: 0,
        updatedAt: new Date().toISOString(),
      },
      cacheSeconds: 10,
    };
  },
});
