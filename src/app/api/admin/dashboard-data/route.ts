import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { getDashboardTableData } from "@/lib/admin/service";
import { getAdminChartData } from "@/lib/adminDailyMetrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }

  try {
    const base = await getDashboardTableData();
    const chartData = await getAdminChartData(14);
    return adminJson(adminOk({ ...base, chartData }), {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (error) {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(`\x1b[31m[api/admin/dashboard-data] handler failed\x1b[0m`, {
      message: err?.message,
      cause,
      stack: err?.stack,
      error,
    });
    const reason = err instanceof Error ? err.message : "dashboard_data_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=5" } });
  }
}
