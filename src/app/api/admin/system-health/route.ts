import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { getSystemHealth } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const data = await getSystemHealth();
    const degraded = Object.values(data.checks).some((c) => c.degraded);
    return adminJson(adminOk(data, { degraded, reason: degraded ? "one_or_more_checks_degraded" : null }), {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("[api/admin/system-health] failed", error);
    const reason = "system_health_unavailable";
    return adminJson(adminFail(reason, { checks: {}, updatedAt: new Date().toISOString() }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}
