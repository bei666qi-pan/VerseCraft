import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { getSystemHealth } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async () => {
  const data = await getSystemHealth();
  const degraded = Object.values(data.checks).some((c) => c.degraded);
  return { data, degraded, reason: degraded ? "one_or_more_checks_degraded" : null };
}, { label: "system-health", cacheSeconds: 15, staleWhileRevalidate: 30, errorReason: "system_health_unavailable" });
