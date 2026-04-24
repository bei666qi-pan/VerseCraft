import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getOverviewMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }

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
    const reason = error instanceof Error ? error.message : "stats_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=10" } });
  }
}
