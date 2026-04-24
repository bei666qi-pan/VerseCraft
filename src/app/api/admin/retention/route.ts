import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getRetentionMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  try {
    const data = await getRetentionMetrics(range);
    return adminJson(adminOk(data), {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[api/admin/retention] failed", error);
    const reason = error instanceof Error ? error.message : "retention_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=10" } });
  }
}
