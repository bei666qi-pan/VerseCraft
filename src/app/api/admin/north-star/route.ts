import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getNorthStarMetrics } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const range = parseAdminTimeRangeFromSearchParams(new URL(req.url).searchParams);
  try {
    const data = await getNorthStarMetrics(range);
    return adminJson(adminOk(data), {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("[api/admin/north-star] failed", error);
    return adminJson(
      adminFail("north_star_unavailable", {
        range,
        northStar: null,
        inputMetrics: [],
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}
