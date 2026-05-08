import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { buildSurveyAggregateReport } from "@/lib/admin/surveyAggregate";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getSurveyAggregate } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  try {
    const data = await getSurveyAggregate(range);
    return adminJson(adminOk(data, {
      degraded: data.evidenceSufficiency === "insufficient",
      reason: data.evidenceSufficiency === "insufficient" ? "insufficient_sample" : null,
    }), {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[api/admin/survey-aggregate] failed", error);
    const reason = "survey_aggregate_unavailable";
    const fallback = buildSurveyAggregateReport(range, [], []);
    return adminJson(adminFail(reason, fallback), { status: 200, headers: { "Cache-Control": "private, max-age=10" } });
  }
}
