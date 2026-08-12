import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import {
  getReasonerHealth,
  buildEmptyReasonerHealth,
} from "@/lib/admin/reasonerHealthMetrics";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async () => {
  const data = await getReasonerHealth();
  const degraded =
    !data.liveness.workerOnline ||
    data.liveness.consecutiveFailures >= 5 ||
    data.deadJobs.worldEngineDead24h > 20;
  return { data, degraded, reason: degraded ? "reasoner_degraded" : null };
}, {
  label: "reasoner-health",
  cacheSeconds: 15,
  staleWhileRevalidate: 30,
  errorReason: "reasoner_health_unavailable",
  onError: () => ({ reason: "reasoner_health_unavailable", fallback: buildEmptyReasonerHealth(), cacheSeconds: 5 }),
});
