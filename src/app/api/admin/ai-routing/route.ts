import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { listRecentAiObservability } from "@/lib/ai/debug/observabilityRing";
import { listRecentAiRoutingReports } from "@/lib/ai/debug/routingRing";
import { snapshotModelCircuits } from "@/lib/ai/fallback/modelCircuit";
import {
  getNarrativeSafetyRuntimeConfig,
  getNarrativeSafetyTelemetrySummary,
} from "@/lib/turnEngine/narrativeSafety";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async () => {
  const [recent, observability] = await Promise.all([
    listRecentAiRoutingReports(),
    listRecentAiObservability(),
  ]);
  return {
    recent,
    observability,
    modelCircuits: snapshotModelCircuits(),
    narrativeSafety: getNarrativeSafetyTelemetrySummary(getNarrativeSafetyRuntimeConfig()),
  };
}, { label: "ai-routing", cacheSeconds: 5, staleWhileRevalidate: 10, errorReason: "ai_routing_unavailable" });
