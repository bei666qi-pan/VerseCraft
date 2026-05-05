import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { getRealtimeMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await verifyAdminRequest();
  if (!guard.ok) return guard.response;

  try {
    const metrics = await getRealtimeMetrics();
    return adminJson(adminOk(metrics), {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    console.error("[api/admin/realtime] failed", error);
    const reason = "realtime_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=3" } });
  }
}
