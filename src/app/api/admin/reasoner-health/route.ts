import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import {
  getReasonerHealth,
  buildEmptyReasonerHealth,
} from "@/lib/admin/reasonerHealthMetrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const data = await getReasonerHealth();
    const degraded =
      !data.liveness.workerOnline ||
      data.liveness.consecutiveFailures >= 5 ||
      data.deadJobs.worldEngineDead24h > 20;
    return adminJson(adminOk(data, { degraded, reason: degraded ? "reasoner_degraded" : null }), {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("[api/admin/reasoner-health] failed", error);
    return adminJson(adminFail("reasoner_health_unavailable", buildEmptyReasonerHealth()), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}
