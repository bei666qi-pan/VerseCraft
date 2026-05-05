import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getBackofficeOverview } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  try {
    const data = await getBackofficeOverview(range);
    return adminJson(adminOk(data), {
      headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=20" },
    });
  } catch (error) {
    console.error("[api/admin/overview] failed", error);
    const reason = "overview_unavailable";
    return adminJson(adminFail(reason, {
      range,
      cards: {
        todayNewUsers: 0,
        totalUsers: 0,
        totalTokens: 0,
        todayTokenCost: 0,
        dau: 0,
        wau: 0,
        mau: 0,
        feedbackCountRange: 0,
        playDurationRangeSec: 0,
      },
      kpis: [],
      chartData: [],
      updatedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}
