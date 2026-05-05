import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getContentQualityMetrics } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const range = parseAdminTimeRangeFromSearchParams(new URL(req.url).searchParams);
  try {
    const data = await getContentQualityMetrics(range);
    return adminJson(adminOk(data, { degraded: data.evidenceSufficiency === "insufficient", reason: data.evidenceSufficiency === "insufficient" ? "insufficient_sample" : null }), {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=240" },
    });
  } catch (error) {
    console.error("[api/admin/content-quality] failed", error);
    const reason = "content_quality_unavailable";
    return adminJson(
      adminFail(reason, {
        range,
        evidenceSufficiency: "insufficient",
        worldSelections: [],
        chapters: { entered: [], completed: [], evidenceSufficiency: "insufficient" },
        npcInteractions: [],
        validatorIssues: 0,
        retryRegenerationCount: 0,
        feedbackTopics: [],
        feedbackSampleSize: 0,
        negativeFeedbackRate: 0,
        surveySampleSize: 0,
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}
