import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getDashboardTableData } from "@/lib/admin/service";
import { getAdminChartData } from "@/lib/adminDailyMetrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const base = await getDashboardTableData();
    const chartData = await getAdminChartData(14);

    return NextResponse.json({
      ...base,
      chartData,
    }, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (error) {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/admin/dashboard-data] handler failed\x1b[0m`,
      { message: err?.message, cause, stack: err?.stack, error }
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
