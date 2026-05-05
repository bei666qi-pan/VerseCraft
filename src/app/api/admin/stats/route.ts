import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getOverviewMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const range = parseAdminTimeRangeFromSearchParams(new URL(req.url).searchParams);
  try {
    const data = await getOverviewMetrics(range);
    return adminJson(
      adminOk({
        totalUsers: data.cards.totalUsers,
        totalTokens: data.cards.totalTokens,
        chartData: data.chartData,
        range: data.range,
      }),
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } }
    );
  } catch (error) {
    console.error("[api/admin/stats] failed", error);
    const reason = "stats_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=10" } });
  }
}
