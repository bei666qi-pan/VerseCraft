import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { getRealtimeMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }

  try {
    const metrics = await getRealtimeMetrics();
    return adminJson(adminOk(metrics), {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    console.error("[api/admin/realtime] failed", error);
    const reason = error instanceof Error ? error.message : "realtime_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=3" } });
  }
}
