import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { getRealtimeMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async () => {
  const metrics = await getRealtimeMetrics();
  return metrics;
}, { label: "realtime", cacheSeconds: 5, staleWhileRevalidate: 10, errorReason: "realtime_unavailable" });
