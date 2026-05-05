import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getAiExperienceMetrics } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const range = parseAdminTimeRangeFromSearchParams(new URL(req.url).searchParams);
  try {
    const data = await getAiExperienceMetrics(range);
    return adminJson(adminOk(data, { degraded: data.evidenceSufficiency === "insufficient", reason: data.evidenceSufficiency === "insufficient" ? "insufficient_sample" : null }), {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[api/admin/ai-experience] failed", error);
    const reason = "ai_experience_unavailable";
    return adminJson(
      adminFail(reason, {
        range,
        sampleSize: 0,
        evidenceSufficiency: "insufficient",
        metrics: [],
        rates: {
          successRate: 0,
          failureRate: 0,
          fallbackRate: 0,
          parseFailureRate: 0,
          queueWait: { p50: null, p95: null, status: "unavailable" },
        },
        cost: { totalTokens: 0, tokenPerEffectiveAction: 0, tokenPerActiveActor: 0, highCostActors: [] },
        anomalies: ["ai_experience_unavailable"],
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}
